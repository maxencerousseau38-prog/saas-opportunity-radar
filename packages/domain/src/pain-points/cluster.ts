// P5 Clusterer (Implementation Blueprint §7.2): average-linkage agglomerative
// clustering on cosine distance, only within the same problem category, with
// versioned parameters (`cluster-1`). Deterministic: ties are broken by
// problem id; singletons stay "isolated complaints".

export const CLUSTER_ALGORITHM_VERSION = "cluster-1" as const;

export interface ClusterParams {
  /** Merge while the average cosine distance is at most this value. */
  distanceThreshold: number;
  /** Groups smaller than this stay isolated complaints. */
  minSize: number;
}

/** [ASSUMPTION] provisional values; calibrated on the evaluation set once PD-24b fixes the model. */
export const CLUSTER_PARAMS_V1: ClusterParams = { distanceThreshold: 0.35, minSize: 2 };

export interface ClusterInput {
  problemId: string;
  category: string;
  vector: number[];
}

export interface ClusterResult {
  clusters: Array<{ category: string; problemIds: string[] }>;
  isolated: string[];
  algorithmVersion: typeof CLUSTER_ALGORITHM_VERSION;
  params: ClusterParams;
}

export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("vectors of different dimensions");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / Math.sqrt(na * nb);
}

function clusterCategory(items: ClusterInput[], params: ClusterParams): string[][] {
  // Each group keeps its members sorted; its key is its smallest problem id.
  const groups = [...items]
    .sort((a, b) => (a.problemId < b.problemId ? -1 : 1))
    .map((i) => ({ ids: [i.problemId], key: i.problemId }));
  const n = groups.length;
  const vec = new Map(items.map((i) => [i.problemId, i.vector]));
  // Pairwise distances between current groups (average linkage via Lance–Williams).
  const dist: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = cosineDistance(vec.get(groups[i]!.key)!, vec.get(groups[j]!.key)!);
      dist[i]![j] = d;
      dist[j]![i] = d;
    }
  const alive = new Array<boolean>(n).fill(true);
  const size = new Array<number>(n).fill(1);
  for (;;) {
    let best: { i: number; j: number; d: number; tie: string } | null = null;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue;
        const d = dist[i]![j]!;
        if (d > params.distanceThreshold + 1e-12) continue;
        const a = groups[i]!.key;
        const b = groups[j]!.key;
        const tie = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!best || d < best.d - 1e-12 || (Math.abs(d - best.d) <= 1e-12 && tie < best.tie))
          best = { i, j, d, tie };
      }
    }
    if (!best) break;
    const { i, j } = best;
    for (let k = 0; k < n; k++) {
      if (!alive[k] || k === i || k === j) continue;
      const d = (size[i]! * dist[i]![k]! + size[j]! * dist[j]![k]!) / (size[i]! + size[j]!);
      dist[i]![k] = d;
      dist[k]![i] = d;
    }
    groups[i] = {
      ids: [...groups[i]!.ids, ...groups[j]!.ids].sort(),
      key: groups[i]!.key < groups[j]!.key ? groups[i]!.key : groups[j]!.key,
    };
    size[i] = size[i]! + size[j]!;
    alive[j] = false;
  }
  return groups.filter((_, k) => alive[k]).map((g) => g.ids);
}

export function clusterProblems(
  items: ClusterInput[],
  params: ClusterParams = CLUSTER_PARAMS_V1,
): ClusterResult {
  const byCategory = new Map<string, ClusterInput[]>();
  for (const item of items)
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  const clusters: ClusterResult["clusters"] = [];
  const isolated: string[] = [];
  for (const category of [...byCategory.keys()].sort()) {
    for (const ids of clusterCategory(byCategory.get(category)!, params)) {
      if (ids.length >= params.minSize) clusters.push({ category, problemIds: ids });
      else isolated.push(...ids);
    }
  }
  clusters.sort((a, b) =>
    a.category !== b.category
      ? a.category < b.category
        ? -1
        : 1
      : a.problemIds[0]! < b.problemIds[0]!
        ? -1
        : 1,
  );
  return {
    clusters,
    isolated: isolated.sort(),
    algorithmVersion: CLUSTER_ALGORITHM_VERSION,
    params,
  };
}
