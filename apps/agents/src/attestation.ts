import { createHash, createPublicKey, verify, X509Certificate } from "node:crypto";
import { INTEL_SGX_ROOT_CA } from "./intel-root.js";

// Intel TDX quote v4 layout (Intel TDX DCAP Quote Generation Library, "Quote Format").
const HEADER = 48;
const BODY = 584;
const SIGNED = HEADER + BODY;
const MRCONFIGID = HEADER + 184;
const REPORT_DATA = HEADER + 520;
const QE_REPORT = 384;
const QE_REPORT_DATA = 320;
const CERT_QE_REPORT = 6;
const CERT_PCK_CHAIN = 5;

export interface QuoteCheck {
  /** Attestation key signature over header and TD report. */
  quoteSigned: boolean;
  /** QE report signature by the PCK certificate. */
  qeReportSigned: boolean;
  /** QE report data is sha256(attestation key || QE auth data). */
  attestationKeyBound: boolean;
  /** PCK certificate chain ends at the pinned Intel SGX Root CA and is within validity. */
  chainToIntelRoot: boolean;
  reportData: string;
  mrConfigId: string;
}

const p1363 = (key: ReturnType<typeof createPublicKey>) => ({
  key,
  dsaEncoding: "ieee-p1363" as const,
});

/**
 * Verifies the signature chain of a TDX quote up to Intel. TCB level and revocation need Intel
 * collateral (TCB info, CRLs) and are not checked here.
 */
export function checkTdxQuote(quoteHex: string, now = new Date()): QuoteCheck {
  const quote = Buffer.from(quoteHex, "hex");
  if (quote.readUInt16LE(0) !== 4) throw new Error("not a version 4 quote");
  let at = SIGNED + 4;
  const signature = quote.subarray(at, at + 64);
  const attestationKey = quote.subarray(at + 64, at + 128);
  at += 128;
  if (quote.readUInt16LE(at) !== CERT_QE_REPORT) throw new Error("unexpected certification data");
  at += 6;
  const qeReport = quote.subarray(at, at + QE_REPORT);
  const qeSignature = quote.subarray(at + QE_REPORT, at + QE_REPORT + 64);
  at += QE_REPORT + 64;
  const authLength = quote.readUInt16LE(at);
  const authData = quote.subarray(at + 2, at + 2 + authLength);
  at += 2 + authLength;
  if (quote.readUInt16LE(at) !== CERT_PCK_CHAIN) throw new Error("missing PCK certificate chain");
  const chainPem = quote.subarray(at + 6, at + 6 + quote.readUInt32LE(at + 2)).toString("utf8");

  const ak = createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: attestationKey.subarray(0, 32).toString("base64url"),
      y: attestationKey.subarray(32).toString("base64url"),
    },
    format: "jwk",
  });
  const chain = (
    chainPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []
  ).map((pem) => new X509Certificate(pem));
  const pck = chain[0];
  return {
    quoteSigned: verify("sha256", quote.subarray(0, SIGNED), p1363(ak), signature),
    qeReportSigned:
      pck !== undefined && verify("sha256", qeReport, p1363(pck.publicKey), qeSignature),
    attestationKeyBound: createHash("sha256")
      .update(Buffer.concat([attestationKey, authData]))
      .digest()
      .equals(qeReport.subarray(QE_REPORT_DATA, QE_REPORT_DATA + 32)),
    chainToIntelRoot: chainEndsAtIntel(chain, now),
    reportData: quote.subarray(REPORT_DATA, REPORT_DATA + 64).toString("hex"),
    mrConfigId: quote.subarray(MRCONFIGID, MRCONFIGID + 48).toString("hex"),
  };
}

function chainEndsAtIntel(chain: X509Certificate[], now: Date): boolean {
  const root = new X509Certificate(INTEL_SGX_ROOT_CA);
  if (chain.length < 2 || chain.at(-1)?.fingerprint256 !== root.fingerprint256) return false;
  return chain.every((cert, i) => {
    const issuer = chain[i + 1] ?? root;
    const valid = new Date(cert.validFrom) <= now && now <= new Date(cert.validTo);
    return valid && cert.checkIssued(issuer) && cert.verify(issuer.publicKey);
  });
}

/** Ed25519 signature by a raw 32-byte public key, both hex. */
export function verifyEd25519(
  message: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  const key = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKeyHex, "hex").toString("base64url") },
    format: "jwk",
  });
  return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signatureHex, "hex"));
}

/** MRCONFIGID of a dstack app: 0x01, sha256 of the raw app compose, 15 zero bytes. */
export function expectedMrConfigId(appCompose: string): string {
  return `01${createHash("sha256").update(appCompose, "utf8").digest("hex")}${"00".repeat(15)}`;
}
