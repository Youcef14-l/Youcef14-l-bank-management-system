export const toSkipTake = ({ page, limit }) => ({ skip: (page - 1) * limit, take: limit });

export const buildPage = (items, total, { page, limit }) => ({
  items,
  meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
});
