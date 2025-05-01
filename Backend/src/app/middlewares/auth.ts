import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import config from '../../config';
import ApiError from '../../errors/ApiError';
import { jwtHelper } from '../../helpers/jwtHelper';
import { User } from '../modules/user/user.model';
import { AUTH_PROVIDER, USER_ROLES, USER_STATUS } from '../../enums/common';
import { cookieHelper, safeCookie } from '../../helpers/cookieHelper';

// Consider using a proper logger instead of console.log for production
const logger = {
  info: (message: string, meta?: object) => {
    console.log(`[INFO] ${message}`, meta || '');
  },
  error: (message: string, meta?: object) => {
    console.error(`[ERROR] ${message}`, meta || '');
  },
};

export interface AuthRequest extends Request {
  user: {
    userId: string;
    role: USER_ROLES;
    email: string;
    name: string;
    authProvider?: AUTH_PROVIDER;
  };
  tokenRefreshed?: boolean;
  newAccessToken?: string;
}

const auth =
  (...roles: USER_ROLES[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract token from cookie or authorization header
      const accessToken =
        req.cookies?.accessToken ||
        (req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.substring(7)
          : undefined);

      logger.info('Auth middleware - Token present:', {
        hasToken: !!accessToken,
        from: {
          cookies: !!req.cookies?.accessToken,
          headers: !!req.headers.authorization,
        },
      });

      if (!accessToken) {
        throw new ApiError(
          StatusCodes.UNAUTHORIZED,
          'Invalid or missing token'
        );
      }

      try {
        // Verify the access token
        const decoded = jwtHelper.verifyToken<{
          userId: string;
          role: USER_ROLES;
          email: string;
          name: string;
          authProvider?: AUTH_PROVIDER;
        }>(accessToken, config.jwt.secret);

        logger.info('Token decoded successfully', {
          userId: decoded.userId,
          role: decoded.role,
        });

        // Check if the user exists and is active
        const user = await User.findById(decoded.userId);
        if (!user || user.status !== USER_STATUS.ACTIVE) {
          logger.error('User check failed', {
            userExists: !!user,
            userStatus: user?.status,
          });
          throw new ApiError(
            StatusCodes.UNAUTHORIZED,
            'User not found or inactive'
          );
        }

        // Check role permissions
        if (roles.length && !roles.includes(decoded.role)) {
          logger.error('Role check failed', {
            requiredRoles: roles,
            userRole: decoded.role,
          });
          throw new ApiError(
            StatusCodes.FORBIDDEN,
            "You don't have permission to access this resource"
          );
        }

        // Attach user info to request
        (req as AuthRequest).user = {
          userId: decoded.userId,
          role: decoded.role,
          email: decoded.email,
          name: decoded.name,
          authProvider: decoded.authProvider,
        };

        logger.info('User authenticated successfully', {
          userId: decoded.userId,
        });
        return next();
      } catch (error) {
        // Handle expired access token
        if (error instanceof jwt.TokenExpiredError) {
          logger.info('Access token expired, checking refresh token');

          const refreshToken = req.cookies?.refreshToken;
          if (!refreshToken) {
            logger.error('No refresh token available');
            throw new ApiError(
              StatusCodes.UNAUTHORIZED,
              'Refresh token required'
            );
          }

          try {
            // Verify refresh token
            const decodedRefresh = jwtHelper.verifyToken<{
              userId: string;
              role: USER_ROLES;
              email: string;
              name: string;
              authProvider?: AUTH_PROVIDER;
            }>(refreshToken, config.jwt.refresh_secret);

            logger.info('Refresh token decoded successfully', {
              userId: decodedRefresh.userId,
            });

            // Check if the user exists and is active
            const user = await User.findById(decodedRefresh.userId);
            if (!user || user.status !== USER_STATUS.ACTIVE) {
              logger.error('User check with refresh token failed', {
                userExists: !!user,
                userStatus: user?.status,
              });
              throw new ApiError(
                StatusCodes.UNAUTHORIZED,
                'User not found or inactive'
              );
            }

            // Check role permissions
            if (roles.length && !roles.includes(user.role)) {
              logger.error('Role check with refresh token failed', {
                requiredRoles: roles,
                userRole: user.role,
              });
              throw new ApiError(
                StatusCodes.FORBIDDEN,
                "You don't have permission to access this resource"
              );
            }

            // Generate new access token
            const newAccessToken = jwtHelper.createToken(
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

            logger.info('New access token generated', {
              userId: user._id.toString(),
            });

            // Attach user info and token refresh flag to request
            const authReq = req as AuthRequest;
            authReq.user = {
              userId: user._id.toString(),
              role: user.role,
              email: user.email,
              name: user.name,
              authProvider: user.authProvider,
            };
            authReq.tokenRefreshed = true;
            authReq.newAccessToken = newAccessToken;

            logger.info('User authenticated with refresh token', {
              userId: user._id.toString(),
            });
            return next();
          } catch (refreshError) {
            logger.error('Refresh token verification failed', {
              error: (refreshError as Error).message,
            });
            throw new ApiError(
              StatusCodes.UNAUTHORIZED,
              'Invalid refresh token'
            );
          }
        }

        logger.error('Token verification failed', {
          error: (error as Error).message,
        });
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid access token');
      }
    } catch (error) {
      logger.error('Authentication middleware error', {
        error: (error as Error).message,
      });
      next(error);
    }
  };

// New middleware to set the refreshed token cookie after authentication
export const setRefreshedTokenCookie = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authReq = req as AuthRequest;

  if (authReq.tokenRefreshed && authReq.newAccessToken) {
    safeCookie.set(
      res,
      'accessToken',
      authReq.newAccessToken,
      cookieHelper.getAccessTokenOptions()
    );
    logger.info('Refreshed access token cookie set');
  }

  next();
};

export default auth;
