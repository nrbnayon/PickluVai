// src/helpers/statsAndPaginationHelper.ts
import { Model } from 'mongoose';

// Interface for individual statistic ratios (count and percentage)
interface IStatisticRatio {
  count: number;
  percentage: string; // e.g., "25.00%"
}

// Interface for the statistics metadata, including pagination info and dynamic stats
interface IStatisticsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  [key: string]: any; // Allows dynamic stat fields (e.g., statusStats, categoryStats)
}

// Type for specifying fields to calculate statistics on
type StatField = {
  field: string; // The field in the Mongoose model (e.g., "status")
  name: string; // The key in the output (e.g., "statusStats")
};

// Type for pagination options
export type IPaginationOptions = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

/**
 * Calculates pagination parameters for database queries.
 * @param options Pagination options (page, limit, sortBy, sortOrder)
 * @returns Object with computed pagination values
 */
const calculatePagination = (options: IPaginationOptions) => {
  const page = Math.max(Number(options.page) || 1, 1); // Ensure page is at least 1
  const limit = Math.max(Number(options.limit) || 20, 1); // Default to 20, min 1
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

/**
 * Calculates statistics for specified fields over a Mongoose model's dataset.
 * @param model The Mongoose model to query
 * @param queryConditions Conditions to filter the documents
 * @param paginationOptions Pagination options (page, limit)
 * @param statFields Array of fields to compute statistics for
 * @returns Statistics metadata with pagination info and computed stats
 */
const calculateStatistics = async <T>(
  model: Model<T>,
  queryConditions: any,
  paginationOptions: { page: number; limit: number },
  statFields: StatField[]
): Promise<IStatisticsMeta> => {
  const { page, limit } = paginationOptions;

  // Get the total number of documents matching the query
  const total = await model.countDocuments(queryConditions);

  // Calculate statistics for each specified field
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

    // Compute ratios, excluding null/undefined _id values
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

  // Await all stats calculations and combine them
  const statsResults = await Promise.all(statsPromises);
  const combinedStats = statsResults.reduce(
    (acc, stat) => ({ ...acc, ...stat }),
    {}
  );

  // Return metadata with pagination info and statistics
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1, // Ensure at least 1 page
    ...combinedStats,
  };
};

// Export both functions as a single helper object
export const statsAndPaginationHelper = {
  calculatePagination,
  calculateStatistics,
};
