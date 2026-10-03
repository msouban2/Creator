import type { QueryClient } from "@tanstack/react-query";

const REVIEW_QUERY_KEYS: readonly (readonly unknown[])[] = [
  ["applications"],
  ["review-action-queue"],
  ["action-queue-depth"],
  ["review-queue-depth"],
  ["review-queue-current"],
  ["submissions"],
  ["review-stats"],
  ["reviewer-workload"],
  ["review-report"],
];

export function invalidateReviewQueries(queryClient: QueryClient) {
  return Promise.all(
    REVIEW_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
}