// src\app\modules\auth\auth.controller.ts
// src\app\modules\auth\auth.controller.ts
import { Request, Response } from 'express';
import { otpService } from './auth.service';
import { jwtHelper } from '../../../helpers/jwtHelper';
import { User } from './auth.model';
import { cookieHelper, safeCookie } from '../../../helpers/cookieHelper';
import sendResponse from '../../../shared/sendResponse';
import { AUTH_PROVIDER, USER_ROLES } from '../../../enums/common';

export const authController = {
  async sendOTP(req: Request, res: Response): Promise<void> {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        sendResponse(res, {
          success: false,
          statusCode: 400,
          message: 'Phone number is required',
        });
        return;
      }

      const { registered, verified } = await otpService.checkPhoneStatus(
        phoneNumber
      );
      if (registered && verified) {
        const user = await User.findOne({
          phoneNumber: otpService['formatPhoneNumber'](phoneNumber),
        });
        const accessToken = jwtHelper.createAccessToken({
          userId: user!._id.toString(),
          role: user!.role,
          phoneNumber: user!.phoneNumber,
          authProvider: user!.authProvider,
        });
        const refreshToken = jwtHelper.createRefreshToken({
          userId: user!._id.toString(),
          role: user!.role,
          phoneNumber: user!.phoneNumber,
          authProvider: user!.authProvider,
        });

        safeCookie.set(
          res,
          'accessToken',
          accessToken,
          cookieHelper.getAccessTokenOptions()
        );
        safeCookie.set(
          res,
          'refreshToken',
          refreshToken,
          cookieHelper.getRefreshTokenOptions()
        );

        sendResponse(res, {
          success: true,
          statusCode: 200,
          message: 'Phone already verified, tokens issued',
          data: { accessToken },
        });
        return;
      }

      const { sessionInfo } = await otpService.generateOTPSession(phoneNumber);
      sendResponse(res, {
        success: true,
        statusCode: 200,
        message: 'OTP sent successfully',
        data: { sessionInfo },
      });
      return;
    } catch (error) {
      sendResponse(res, {
        success: false,
        statusCode: 500,
        message: error instanceof Error ? error.message : 'Failed to send OTP',
      });
      return;
    }
  },

  async verifyOTP(req: Request, res: Response): Promise<void> {
    try {
      const { sessionInfo, code } = req.body;
      if (!sessionInfo || !code) {
        sendResponse(res, {
          success: false,
          statusCode: 400,
          message: 'Session info and code are required',
        });
        return;
      }

      const { valid, uid } = await otpService.verifyOTP(sessionInfo, code);
      if (!valid) {
        sendResponse(res, {
          success: false,
          statusCode: 400,
          message: 'Invalid or expired OTP',
        });
        return;
      }

      const user = await User.findById(uid);
      if (!user) {
        sendResponse(res, {
          success: false,
          statusCode: 404,
          message: 'User not found',
        });
        return;
      }

      const accessToken = jwtHelper.createAccessToken({
        userId: uid || (() => { throw new Error('User ID is undefined'); })(),
        role: user.role || USER_ROLES.USER,
        phoneNumber: user.phoneNumber,
        authProvider: AUTH_PROVIDER.LOCAL,
      });
      const refreshToken = jwtHelper.createRefreshToken({
        userId: uid,
        role: user.role || USER_ROLES.USER,
        phoneNumber: user.phoneNumber,
        authProvider: AUTH_PROVIDER.LOCAL,
      });

      safeCookie.set(
        res,
        'accessToken',
        accessToken,
        cookieHelper.getAccessTokenOptions()
      );
      safeCookie.set(
        res,
        'refreshToken',
        refreshToken,
        cookieHelper.getRefreshTokenOptions()
      );

      sendResponse(res, {
        success: true,
        statusCode: 200,
        message: 'Phone verified successfully',
        data: { accessToken },
      });
      return;
    } catch (error) {
      sendResponse(res, {
        success: false,
        statusCode: 500,
        message:
          error instanceof Error ? error.message : 'Failed to verify OTP',
      });
      return;
    }
  },
};