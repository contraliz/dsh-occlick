/**
 * `dsh-occlick` — Host half.
 *
 * This package contributes browser presentation only: the click runs in the Web
 * client, shipped through `exports["./client"]`. The empty `apply` still gives
 * the Loader a Host-side row, which is what makes the entry eligible for a
 * served client bundle.
 */

/** Host plugin body — intentionally empty. */
export function apply() {}
