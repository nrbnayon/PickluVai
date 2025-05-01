// src/app/modules/user/user.service.ts
import { StatusCodes } from 'http-status-codes';
import bcrypt from 'bcrypt';
import axios from 'axios';
import ApiError from '../../../errors/ApiError';
import { jwtHelper } from '../../../helpers/jwtHelper';
import { encryptionHelper } from '../../../helpers/encryptionHelper';
import config from '../../../config';
import {
  AUTH_PROVIDER,
  USER_PLAN,
  USER_ROLES,
  USER_STATUS,
} from '../../../enums/common';
import { IOAuthLoginResponse, IUser } from './user.interface';
import { User } from './user.model';

interface OAuthProfile {
  id: string;
  displayName: string;
  emails?: Array<{ value: string }>;
  _json?: { mail?: string; userPrincipalName?: string };
  googleAccessToken?: string;
  googleRefreshToken?: string;
  microsoftAccessToken?: string;
  microsoftRefreshToken?: string;
}

const handleOAuthCallback = async (
  profile: OAuthProfile,
  provider: AUTH_PROVIDER
) => {
  let user: IUser | null;
  let email: string,
    name: string,
    providerId: string,
    oauthAccessToken: string,
    oauthRefreshToken: string | undefined;

  switch (provider) {
    case AUTH_PROVIDER.GOOGLE:
      if (!profile.emails || !profile.emails[0])
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Email not provided');
      email = profile.emails[0].value;
      name = profile.displayName;
      providerId = profile.id;
      oauthAccessToken = profile.googleAccessToken!;
      oauthRefreshToken = profile.googleRefreshToken;
      break;
    case AUTH_PROVIDER.MICROSOFT:
      email = profile._json?.mail || profile._json?.userPrincipalName || '';
      if (!email)
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Email not provided');
      name = profile.displayName;
      providerId = profile.id;
      oauthAccessToken = profile.microsoftAccessToken!;
      oauthRefreshToken = profile.microsoftRefreshToken;
      break;
    default:
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Unsupported provider');
  }

  user = await User.isExistUserByEmail(email);
  if (user) {
    user.authProvider = provider;
    if (provider === AUTH_PROVIDER.GOOGLE) user.googleId = providerId;
    if (provider === AUTH_PROVIDER.MICROSOFT) user.microsoftId = providerId;
    user[
      provider === AUTH_PROVIDER.GOOGLE
        ? 'googleAccessToken'
        : 'microsoftAccessToken'
    ] = encryptionHelper.encrypt(oauthAccessToken);
    if (oauthRefreshToken)
      user.refreshToken = encryptionHelper.encrypt(oauthRefreshToken);
    user.lastSync = new Date();
    await user.save();
  } else {
    user = await User.create({
      email,
      name,
      authProvider: provider,
      [provider === AUTH_PROVIDER.GOOGLE ? 'googleId' : 'microsoftId']:
        providerId,
      [provider === AUTH_PROVIDER.GOOGLE
        ? 'googleAccessToken'
        : 'microsoftAccessToken']: encryptionHelper.encrypt(oauthAccessToken),
      refreshToken: oauthRefreshToken
        ? encryptionHelper.encrypt(oauthRefreshToken)
        : undefined,
      role: USER_ROLES.USER,
      verified: true,
      status: USER_STATUS.ACTIVE,
      lastSync: new Date(),
    });
  }

  const jwtPayload = {
    userId: user._id.toString(),
    role: user.role,
    email: user.email,
    name: user.name,
    authProvider: user.authProvider,
  };
  const jwtAccessToken = jwtHelper.createToken(
    jwtPayload,
    config.jwt.secret,
    config.jwt.expire_in
  );

  return {
    accessToken: jwtAccessToken,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      image: user.image,
      authProvider: user.authProvider,
    },
  };
};
const handleOAuthError = (error: any, provider: string): never => {
  console.error(`${provider} OAuth error:`, error);
  if (axios.isAxiosError(error)) {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      `${provider} authentication failed: ${
        error.response?.data?.error || error.message
      }`
    );
  }
  throw new ApiError(
    StatusCodes.INTERNAL_SERVER_ERROR,
    `${provider} authentication error`
  );
};

// Update yahooLoginIntoDB to request email access scope
const yahooLoginIntoDB = async ({
  code,
}: {
  code: string;
}): Promise<IOAuthLoginResponse> => {
  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post(
      'https://api.login.yahoo.com/oauth2/get_token',
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.oauth.yahoo.redirect_uri,
        client_id: config.oauth.yahoo.client_id,
        client_secret: config.oauth.yahoo.client_secret,
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    // Get user info from Yahoo
    const userResponse = await axios.get(
      'https://api.login.yahoo.com/openid/v1/userinfo',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const yahooUser = userResponse.data;

    // Find or create user
    let user = await User.findOne({ email: yahooUser.email });

    if (!user) {
      user = await User.create({
        email: yahooUser.email,
        name: yahooUser.name,
        yahooId: yahooUser.sub,
        yahooAccessToken: access_token,
        refreshToken: refresh_token,
        authProvider: AUTH_PROVIDER.YAHOO,
        role: USER_ROLES.USER,
        verified: true,
        status: USER_STATUS.ACTIVE,
      });
    } else {
      user.yahooId = yahooUser.sub;
      user.yahooAccessToken = access_token;
      user.refreshToken = refresh_token;
      user.authProvider = AUTH_PROVIDER.YAHOO;
      await user.save();
    }

    // Generate tokens
    const accessToken = jwtHelper.createToken(
      {
        userId: user._id.toString(),
        role: user.role,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider,
      },
      config.jwt.secret,
      config.jwt.expire_in
    );

    const refreshToken = jwtHelper.createToken(
      {
        userId: user._id.toString(),
        role: user.role,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider,
      },
      config.jwt.refresh_secret,
      config.jwt.refresh_expires_in
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.image,
      },
    };
  } catch (error) {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      'Failed to authenticate with Yahoo'
    );
  }
};

const localLoginIntoDB = async (payload: {
  email: string;
  password: string;
}) => {
  const user = await User.isExistUserByEmail(payload.email);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  if (user.authProvider !== AUTH_PROVIDER.LOCAL)
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Use OAuth login for this account'
    );
  if (
    !user.password ||
    !(await bcrypt.compare(payload.password, user.password))
  ) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  const jwtPayload = { userId: user._id.toString(), role: user.role };
  const accessToken = jwtHelper.createAccessToken(jwtPayload);
  const refreshToken = jwtHelper.createRefreshToken(jwtPayload);
  return { user, accessToken, refreshToken };
};

const refreshToken = async (refreshToken: string) => {
  const decoded = jwtHelper.verifyToken<{ userId: string; role: string }>(
    refreshToken,
    config.jwt.refresh_secret
  );
  const user = await User.isExistUserById(decoded.userId);
  if (!user || user.status !== USER_STATUS.ACTIVE)
    throw new ApiError(StatusCodes.FORBIDDEN, 'User not found or inactive');

  const jwtPayload = { userId: user._id.toString(), role: user.role };
  const accessToken = jwtHelper.createAccessToken(jwtPayload);
  return { accessToken };
};

const logout = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');

  user.googleAccessToken = undefined;
  user.microsoftAccessToken = undefined;
  user.yahooAccessToken = undefined;
  user.refreshToken = undefined;
  user.lastSync = new Date();
  await user.save();
};

const getCurrentUser = async (userId: string) => {
  console.log('Getting current user with ID:', userId);

  if (!userId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'User ID is required');
  }

  const user = await User.findById(userId).select('-password');

  if (!user) {
    console.log('User not found with ID:', userId);
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  return user;
};

const updateProfile = async (userId: string, profileData: Partial<IUser>) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');

  const allowedUpdates = [
    'name',
    'phone',
    'address',
    'country',
    'gender',
    'dateOfBirth',
  ] as const;
  const filteredData = Object.fromEntries(
    Object.entries(profileData).filter(([key]) =>
      allowedUpdates.includes(key as any)
    )
  );

  Object.assign(user, filteredData);
  user.lastSync = new Date();
  await user.save();
  return user;
};

const updateSubscription = async (
  userId: string,
  subscriptionData: { plan: USER_PLAN; autoRenew?: boolean }
) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');

  if (
    subscriptionData.plan &&
    subscriptionData.plan !== user.subscription.plan
  ) {
    const endDateMap: Record<USER_PLAN, Date> = {
      [USER_PLAN.FREE]: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      [USER_PLAN.BASIC]: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      [USER_PLAN.PREMIUM]: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      [USER_PLAN.ENTERPRISE]: new Date(
        Date.now() + 2 * 365 * 24 * 60 * 60 * 1000
      ),
    };

    user.subscription.plan = subscriptionData.plan;
    user.subscription.startDate = new Date();
    user.subscription.endDate = endDateMap[subscriptionData.plan];
    user.subscription.status = 'ACTIVE';
  }

  if (typeof subscriptionData.autoRenew === 'boolean') {
    user.subscription.autoRenew = subscriptionData.autoRenew;
  }

  user.lastSync = new Date();
  await user.save();
  return user;
};

export const UserService = {
  handleOAuthCallback,
  yahooLoginIntoDB,
  localLoginIntoDB,
  refreshToken,
  logout,
  getCurrentUser,
  updateProfile,
  updateSubscription
};
