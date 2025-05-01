// src/app/modules/user/user.model.ts
import { model, Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import {
  AUTH_PROVIDER,
  USER_GENDER,
  USER_PLAN,
  USER_ROLES,
  USER_STATUS,
} from '../../../enums/common';
import { IUser, UserModel } from './user.interface';
import config from '../../../config';
import { encryptionHelper } from '../../../helpers/encryptionHelper';

const userSubscriptionSchema = new Schema({
  plan: {
    type: String,
    enum: Object.values(USER_PLAN),
    default: USER_PLAN.FREE,
  },
  startDate: { type: Date, default: Date.now },
  endDate: {
    type: Date,
    default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
    default: 'ACTIVE',
  },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  dailyRequests: { type: Number, default: 0 },
  dailyTokens: { type: Number, default: 0 },
  lastRequestDate: { type: Date },
  autoRenew: { type: Boolean, default: true },
});

const userSchema = new Schema<IUser, UserModel>(
  {
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.USER,
      required: true,
    },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    authProvider: {
      type: String,
      enum: Object.values(AUTH_PROVIDER),
      required: true,
    },
    image: String,
    phone: String,
    password: { type: String },
    address: String,
    googleId: { type: String, sparse: true },
    microsoftId: { type: String, sparse: true },
    yahooId: { type: String, sparse: true },
    googleAccessToken: String,
    microsoftAccessToken: String,
    yahooAccessToken: String,
    refreshToken: String,
    country: String,
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
    },
    verified: { type: Boolean, default: false },
    gender: { type: String, enum: Object.values(USER_GENDER) },
    dateOfBirth: Date,
    isActive: { type: Boolean, default: true },
    lastActiveAt: Date,
    lastSync: { type: Date, default: Date.now },
    subscription: { type: userSubscriptionSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.googleAccessToken;
        delete ret.microsoftAccessToken;
        delete ret.yahooAccessToken;
        delete ret.refreshToken;
        return ret;
      },
    },
  }
);

// In pre-save hook, add error handling
userSchema.pre('save', async function (next) {
  try {
    if (this.isModified('password') && this.password) {
      this.password = await bcrypt.hash(
        this.password,
        config.security.bcrypt_salt_rounds
      );
    }

    // Encrypt sensitive data
    if (this.isModified('googleAccessToken') && this.googleAccessToken) {
      this.googleAccessToken = encryptionHelper.encrypt(this.googleAccessToken);
    }
    if (this.isModified('microsoftAccessToken') && this.microsoftAccessToken) {
      this.microsoftAccessToken = encryptionHelper.encrypt(
        this.microsoftAccessToken
      );
    }
    if (this.isModified('yahooAccessToken') && this.yahooAccessToken) {
      this.yahooAccessToken = encryptionHelper.encrypt(this.yahooAccessToken);
    }
    if (this.isModified('refreshToken') && this.refreshToken) {
      this.refreshToken = encryptionHelper.encrypt(this.refreshToken);
    }

    next();
  } catch (error) {
    next(error as Error);
  }
});

// Fix the decryption logic
// userSchema.methods.getDecryptedToken = function(tokenName: string) {
//   const encrypted = (this as any)[tokenName] as string;
//   if (!encrypted) return null;

//   try {
//     return encryptionHelper.decrypt(encrypted);
//   } catch (error) {
//     console.error(`Failed to decrypt ${tokenName}:`, error);
//     return null;
//   }
// };

userSchema.methods.getDecryptedToken = function (tokenName: string) {
  const encrypted = (this as any)[tokenName] as string;
  console.log(`getDecryptedToken - Raw ${tokenName}:`, encrypted);
  if (!encrypted) return null;
  try {
    const decrypted = encryptionHelper.decrypt(encrypted);
    console.log(`getDecryptedToken - Decrypted ${tokenName}:`, decrypted);
    return decrypted;
  } catch (error) {
    console.error(`Failed to decrypt ${tokenName}:`, error);
    return null;
  }
};

// Decrypt sensitive data when fetching
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (obj.googleAccessToken) {
    obj.googleAccessToken = encryptionHelper.decrypt(obj.googleAccessToken);
  }
  if (obj.microsoftAccessToken) {
    obj.microsoftAccessToken = encryptionHelper.decrypt(
      obj.microsoftAccessToken
    );
  }
  if (obj.yahooAccessToken) {
    obj.yahooAccessToken = encryptionHelper.decrypt(obj.yahooAccessToken);
  }
  if (obj.refreshToken) {
    obj.refreshToken = encryptionHelper.decrypt(obj.refreshToken);
  }
  delete obj.password;
  return obj;
};

userSchema.statics.isExistUserById = async function (
  id: string
): Promise<IUser | null> {
  return await this.findById(id);
};

userSchema.statics.isExistUserByEmail = async function (
  email: string
): Promise<IUser | null> {
  return await this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.isExistUserByProvider = async function (
  provider: AUTH_PROVIDER,
  providerId: string
): Promise<IUser | null> {
  const query: any = {};
  switch (provider) {
    case AUTH_PROVIDER.GOOGLE:
      query.googleId = providerId;
      break;
    case AUTH_PROVIDER.MICROSOFT:
      query.microsoftId = providerId;
      break;
    case AUTH_PROVIDER.YAHOO:
      query.yahooId = providerId;
      break;
  }
  return await this.findOne(query);
};

export const User = model<IUser, UserModel>('User', userSchema);
