/**
 * MongoDB aggregate stages to flatten `attributes.deal` from action_log.
 * Funifier may store the deal as a string or as an array of strings; grouping on
 * `$attributes.deal` alone would treat arrays as a single composite key.
 *
 * Insert after $match stages that already filter user/time/team.
 */
export const ATTRIBUTES_DEAL_UNWIND_STAGES: Record<string, unknown>[] = [
  {
    $addFields: {
      dealValues: {
        $cond: [
          { $isArray: '$attributes.deal' },
          '$attributes.deal',
          ['$attributes.deal']
        ]
      }
    }
  },
  { $unwind: '$dealValues' },
  {
    $match: {
      dealValues: { $nin: [null, ''] }
    }
  }
];
