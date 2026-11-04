// robots.txt (RFC 9309) for the official-website connector (ADR-013).

interface Rule {
  allow: boolean;
  pattern: string;
}

export interface RobotsRules {
  /** Unreachable robots.txt (5xx): assume complete disallow (RFC 9309 §2.3.1.4). */
  disallowAll: boolean;
  rules: Rule[];
}

export const ALLOW_ALL: RobotsRules = { disallowAll: false, rules: [] };
export const DISALLOW_ALL: RobotsRules = { disallowAll: true, rules: [] };

/** Rules of the most specific group for `agentToken` (falls back to `*`). */
export function parseRobots(text: string, agentToken: string): RobotsRules {
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m?.[1]) continue;
    const key = m[1].toLowerCase();
    const value = (m[2] ?? "").trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value === "") continue; // empty Disallow = allow everything
      current.rules.push({ allow: key === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  const token = agentToken.toLowerCase();
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return { disallowAll: false, rules: chosen.flatMap((g) => g.rules) };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Longest match wins; on a tie, Allow wins (RFC 9309 §2.2.2). */
export function isAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  if (rules.disallowAll) return false;
  let best: Rule | null = null;
  for (const rule of rules.rules) {
    if (!patternToRegExp(rule.pattern).test(pathAndQuery)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
