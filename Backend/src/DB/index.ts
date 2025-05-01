import colors from 'colors';
import { User } from '../app/modules/user/user.model';
import config from '../config';
import { AUTH_PROVIDER, USER_ROLES, USER_STATUS } from '../enums/common';
import { logger } from '../shared/logger';

const superUser = {
  name: 'Nayon',
  role: USER_ROLES.ADMIN,
  email: config.admin.email,
  password: config.admin.password,
  image: '',
  verified: true,
  status: USER_STATUS.ACTIVE,
  authProvider: AUTH_PROVIDER.LOCAL,
};

const seedAdmin = async () => {
  const isExistSuperAdmin = await User.findOne({
    role: USER_ROLES.ADMIN,
  });

  const isExistEmail = await User.findOne({
    email: config.admin.email,
  });

  if (!isExistSuperAdmin && !isExistEmail) {
    await User.create(superUser);
    logger.info(colors.green('✔  Admin created successfully!'));
  } else if (isExistEmail && !isExistSuperAdmin) {
    logger.info(
      colors.yellow('⚠️  Admin email already exists with different role!')
    );
  } else {
    logger.info(colors.blue('ℹ️  Admin already exists, skipping creation'));
  }
};

export default seedAdmin;
