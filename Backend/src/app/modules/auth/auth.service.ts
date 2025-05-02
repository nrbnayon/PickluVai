import { USER_STATUS } from '../../../enums/common';
import { User } from './auth.model';
import generateOTP from '../../../util/generateOTP';

class OTPService {
  private formatPhoneNumber(phoneNumber: string): string {
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (digitsOnly.startsWith('880')) return `+880${digitsOnly.substring(3)}`;
    if (digitsOnly.startsWith('91')) return `+91${digitsOnly.substring(2)}`;
    if (digitsOnly.startsWith('0')) return `+880${digitsOnly.substring(1)}`;
    return `+880${digitsOnly}`;
  }

  async generateOTPSession(
    phoneNumber: string
  ): Promise<{ sessionInfo: string }> {
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    let user = await User.findOne({ phoneNumber: formattedNumber });

    if (user && user.isOtpVerified) {
      throw new Error('Phone number already verified');
    }

    const otp = generateOTP().toString();
    const otpExpires = new Date(Date.now() + 60 * 1000); // 1 minute expiration

    if (user) {
      user.otp = otp;
      user.otpExpires = otpExpires;
      user.otpAttempts = 0;
      await user.save();
    } else {
      user = await User.create({
        phoneNumber: formattedNumber,
        otp,
        otpExpires,
        otpAttempts: 0,
        isOtpVerified: false,
      });
    }

    // In a real application, you would send the OTP via SMS (e.g., using Twilio or another SMS service)
    console.log(`OTP for ${formattedNumber}: ${otp}`); // For debugging

    return { sessionInfo: otp };
  }

  async verifyOTP(
    sessionInfo: string,
    code: string
  ): Promise<{ valid: boolean; uid?: string }> {
    const user = await User.findOne({ otp: sessionInfo });

    if (
      !user ||
      user.otp !== code ||
      user.otpExpires < new Date() ||
      user.otpAttempts >= 3
    ) {
      if (user) {
        user.otpAttempts += 1;
        await user.save();
      }
      return { valid: false };
    }

    user.isOtpVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.otpAttempts = 0;
    user.status = USER_STATUS.ACTIVE;
    await user.save();

    return { valid: true, uid: user._id.toString() };
  }

  async checkPhoneStatus(
    phoneNumber: string
  ): Promise<{ registered: boolean; verified: boolean }> {
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    const user = await User.findOne({ phoneNumber: formattedNumber });
    return {
      registered: !!user,
      verified: user?.isOtpVerified || false,
    };
  }
}

export const otpService = new OTPService();
