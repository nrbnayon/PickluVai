import { Model } from 'mongoose';
import { IPaginationOptions } from '../types/pagination';

interface IStatisticRatio {
  count: number;
  percentage: string;
}

interface IStatisticsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  [key: string]: any;
}

type StatField = {
  field: string;
  name: string;
};

const calculatePagination = (options: IPaginationOptions) => {
  const defaultLimit = 100000000000000;
  const page = Number(options.page || 1);
  const limit = Number(options.limit || 20 || defaultLimit);
  const skip = (page - 1) * limit;
  const sortBy = options.sortBy || 'createdAt';
  const sortOrder = options.sortOrder || 'desc';

  return {
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
  };
};

const calculateStatistics = async <T>(
  model: Model<T>,
  queryConditions: any,
  paginationOptions: {
    page: number;
    limit: number;
  },
  statFields: StatField[]
): Promise<IStatisticsMeta> => {
  const { page, limit } = paginationOptions;
  const total = await model.countDocuments(queryConditions);

  const statsPromises = statFields.map(async ({ field, name }) => {
    const stats = await model.aggregate([
      { $match: queryConditions },
      {
        $group: {
          _id: `$${field}`,
          count: { $sum: 1 },
        },
      },
    ]);

    const ratioStats = stats.reduce((acc, { _id, count }) => {
      if (_id) {
        acc[_id] = {
          count,
          percentage: ((count / total) * 100).toFixed(2) + '%',
        };
      }
      return acc;
    }, {} as Record<string, IStatisticRatio>);

    return { [name]: ratioStats };
  });

  const statsResults = await Promise.all(statsPromises);
  const combinedStats = statsResults.reduce(
    (acc, stat) => ({ ...acc, ...stat }),
    {}
  );

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    ...combinedStats,
  };
};

export const dataHelper = {
  calculatePagination,
  calculateStatistics,
};
