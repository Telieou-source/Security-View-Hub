import geoip from "geoip-lite";

/**
 * Look up the ISO-2 country code for an IPv4 address.
 * Returns null if the IP is private, invalid, or not found.
 */
export function lookupCountry(ip: string): string | null {
  // Strip CIDR notation if present
  const bare = ip.split("/")[0];

  // Skip private / loopback / link-local ranges quickly
  if (
    bare.startsWith("10.") ||
    bare.startsWith("192.168.") ||
    bare.startsWith("127.") ||
    bare.startsWith("169.254.") ||
    bare.startsWith("172.16.") ||
    bare.startsWith("172.17.") ||
    bare.startsWith("172.18.") ||
    bare.startsWith("172.19.") ||
    bare.startsWith("172.2") ||
    bare.startsWith("172.30.") ||
    bare.startsWith("172.31.") ||
    bare === "0.0.0.0" ||
    bare.startsWith("::") ||
    bare.startsWith("fc") ||
    bare.startsWith("fd")
  ) {
    return null;
  }

  try {
    const geo = geoip.lookup(bare);
    return geo?.country ?? null;
  } catch {
    return null;
  }
}
