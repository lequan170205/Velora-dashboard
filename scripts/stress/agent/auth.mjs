import { createHash } from "node:crypto";
export function adminAuthorizer(
  origin,
  { fetchImpl = fetch, now = () => Date.now() } = {},
) {
  const cache = new Map();
  return async (token) => {
    if (typeof token !== "string" || token.length > 8192)
      throw new Error("Unauthorized");
    let claims;
    try {
      claims = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      );
    } catch {
      throw new Error("Unauthorized");
    }
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now())
      throw new Error("Unauthorized");
    const key = createHash("sha256").update(token).digest("hex"),
      hit = cache.get(key);
    if (hit && hit.until > now()) return hit.actor;
    const r = await fetchImpl(origin + "/auth/me", {
      headers: {
        Authorization: "Bearer " + token,
        "User-Agent": "VeloraStressDemo/1.0",
      },
      redirect: "error",
      signal: AbortSignal.timeout(3500),
    });
    if (!r.ok) throw new Error("Unauthorized");
    const user = await r.json();
    if (
      typeof user.id !== "string" ||
      user.id !== claims.sub ||
      !Array.isArray(user.roles) ||
      !user.roles.includes("ADMIN")
    )
      throw new Error("Unauthorized");
    const actor = { id: user.id };
    cache.set(key, {
      actor,
      until: Math.min(now() + 10000, claims.exp * 1000),
    });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return actor;
  };
}
