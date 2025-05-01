// src/config/passport.ts
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { User } from '../app/modules/user/user.model';
import config from './index';
import { AUTH_PROVIDER, USER_ROLES, USER_STATUS } from '../enums/common';
import { encryptionHelper } from '../helpers/encryptionHelper';

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, false);
  }
});

// Google OAuth Strategy (Gmail email access)
// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: config.oauth.google.client_id || '',
//       clientSecret: config.oauth.google.client_secret || '',
//       callbackURL: config.oauth.google.redirect_uri,
//       scope: [
//         'profile',
//         'email',
//         'https://www.googleapis.com/auth/gmail.readonly', // Add Gmail email access
//       ],
//     },
//     async (
//       accessToken: string,
//       refreshToken: string,
//       profile: any,
//       done: any
//     ) => {
//       try {
//         if (!profile.emails || !profile.emails[0]) {
//           return done(new Error('Email not provided'), false);
//         }

//         const email = profile.emails[0].value;
//         let user = await User.findOne({ email });

//         if (user) {
//           // Update existing user
//           user.googleId = profile.id;
//           user.googleAccessToken = accessToken;
//           user.refreshToken = refreshToken;
//           user.authProvider = AUTH_PROVIDER.GOOGLE;
//           user.name = profile.displayName;
//           user.image = profile.photos?.[0]?.value;
//           await user.save();
//         } else {
//           // Create new user
//           user = await User.create({
//             email,
//             name: profile.displayName,
//             googleId: profile.id,
//             googleAccessToken: accessToken,
//             refreshToken: refreshToken,
//             authProvider: AUTH_PROVIDER.GOOGLE,
//             role: USER_ROLES.USER,
//             verified: true,
//             status: USER_STATUS.ACTIVE,
//             image: profile.photos?.[0]?.value,
//           });
//         }

//         return done(null, user);
//       } catch (error) {
//         console.error('Error in Google OAuth strategy:', error);
//         return done(error, false);
//       }
//     }
//   )
// );
// src/config/passport.ts
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL:
        process.env.GOOGLE_REDIRECT_URI || config.oauth.google.redirect_uri,
      scope: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
      accessType: 'offline' as const, // Type assertion
      prompt: 'consent' as const, // Type assertion
    } as any, // Temporary workaround for typing issue
    async (
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any
    ) => {
      try {
        console.log('Raw Google OAuth Response:', {
          accessToken,
          refreshToken,
        });

        const encryptedAccessToken = encryptionHelper.encrypt(accessToken);
        const encryptedRefreshToken = refreshToken
          ? encryptionHelper.encrypt(refreshToken)
          : undefined;

        // Test decryption immediately
        const decryptedAccessToken =
          encryptionHelper.decrypt(encryptedAccessToken);
        const decryptedRefreshToken = encryptedRefreshToken
          ? encryptionHelper.decrypt(encryptedRefreshToken)
          : undefined;
        console.log('Encryption/Decryption Test:', {
          originalRefreshToken: refreshToken,
          encryptedRefreshToken,
          decryptedRefreshToken,
          matches: refreshToken === decryptedRefreshToken,
        });

        if (!profile.emails || !profile.emails[0]) {
          return done(new Error('Email not provided'), false);
        }

        const email = profile.emails[0].value;
        let user = await User.findOne({ email });

        if (user) {
          user.googleId = profile.id;
          user.googleAccessToken = accessToken; 
          user.refreshToken = refreshToken;
          user.authProvider = AUTH_PROVIDER.GOOGLE;
          user.name = profile.displayName;
          user.image = profile.photos?.[0]?.value;
          await user.save();
        } else {
          user = await User.create({
            email,
            name: profile.displayName,
            googleId: profile.id,
            googleAccessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            authProvider: AUTH_PROVIDER.GOOGLE,
            role: 'USER',
            verified: true,
            status: 'ACTIVE',
            image: profile.photos?.[0]?.value,
          });
        }

        console.log('OAuth Callback - User Saved:', {
          email: user.email,
          googleAccessToken: user.googleAccessToken,
          refreshToken: user.refreshToken ? 'present' : 'not present',
        });

        return done(null, user);
      } catch (error) {
        console.error('Error in Google OAuth strategy:', error);
        return done(error, false);
      }
    }
  )
);
// Microsoft OAuth Strategy (Outlook email access)
passport.use(
  new MicrosoftStrategy(
    {
      clientID: config.oauth.microsoft.client_id || '',
      clientSecret: config.oauth.microsoft.client_secret || '',
      callbackURL: config.oauth.microsoft.redirect_uri,
      scope: [
        'user.read',
        'Mail.Read', // Add Outlook email access
      ],
      tenant: 'common',
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any
    ) => {
      try {
        const email = profile._json.mail || profile._json.userPrincipalName;
        if (!email) {
          return done(new Error('Email not provided'), false);
        }

        let user = await User.findOne({ email });

        if (user) {
          // Update existing user
          user.microsoftId = profile.id;
          user.microsoftAccessToken = accessToken;
          user.refreshToken = refreshToken;
          user.authProvider = AUTH_PROVIDER.MICROSOFT;
          user.name = profile.displayName;
          await user.save();
        } else {
          // Create new user
          user = await User.create({
            email,
            name: profile.displayName,
            microsoftId: profile.id,
            microsoftAccessToken: accessToken,
            refreshToken: refreshToken,
            authProvider: AUTH_PROVIDER.MICROSOFT,
            role: USER_ROLES.USER,
            verified: true,
            status: USER_STATUS.ACTIVE,
          });
        }

        return done(null, user);
      } catch (error) {
        console.error('Error in Microsoft OAuth strategy:', error);
        return done(error, false);
      }
    }
  )
);

export default passport;
