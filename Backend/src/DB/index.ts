import colors from 'colors';
import config from '../config';
import { AUTH_PROVIDER, USER_ROLES, USER_STATUS } from '../enums/common';
import { logger } from '../shared/logger';
import { User } from '../app/modules/auth/auth.model';

const superUser = {
  name: 'Nayon',
  role: USER_ROLES.SUPER_ADMIN,
  email: config.super_admin.email,
  password: config.super_admin.password,
  phoneNumber: +880123456789,
  phoneNumberVerified: true,
  image: '',
  verified: true,
  status: USER_STATUS.ACTIVE,
  authProvider: AUTH_PROVIDER.LOCAL,
};

const seedAdmin = async () => {
  const isExistSuperAdmin = await User.findOne({
    role: USER_ROLES.SUPER_ADMIN,
  });

  const isExistEmail = await User.findOne({
    email: config.super_admin.email,
  });

  if (!isExistSuperAdmin && !isExistEmail) {
    await User.create(superUser);
    logger.info(colors.green('✔ Super Admin created successfully!'));
  } else if (isExistEmail && !isExistSuperAdmin) {
    logger.info(
      colors.yellow('⚠️  Admin email already exists with different role!')
    );
  } else {
    logger.info(colors.blue('ℹ️  Admin already exists, skipping creation'));
  }
};

export default seedAdmin;
