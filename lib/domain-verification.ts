import { promises as dns } from 'dns';
import { VerifyDomainIdentityCommand, VerifyDomainDkimCommand } from "@aws-sdk/client-ses";
// import type { DnsRecords, VerificationResult } from "./domain-verification";
import { sesClient } from "./ses"
export interface DnsRecords {
  txt: {
    key: string;
    value: string;
  };
  mx: {
    key: string;
    value: string;
  };
  cname: Array<{
    key: string;
    value: string;
  }>;
}

export interface VerificationResult {
  verified: boolean;
  txtVerified: boolean;
  mxVerified: boolean;
  cnameVerified: boolean;
  cnameDetails: Array<{
    key: string;
    value: string;
    verified: boolean;
  }>;
  errors: string[];
}

/**
 * Generate real DNS records from AWS SES
 */
export async function generateDnsRecords(domain: string): Promise<DnsRecords> {
  // 1. Ask SES to start domain identity verification
  const identity = await sesClient.send(new VerifyDomainIdentityCommand({ Domain: domain }));

  // 2. Ask SES to create DKIM records (3 CNAMEs)
  const dkim = await sesClient.send(new VerifyDomainDkimCommand({ Domain: domain }));

  // 3. Build records
  return {
    // TXT verification token SES expects
    txt: {
      key: domain,
      value: `amazonses:${identity.VerificationToken}`,
    },
    // MX record for SES inbound mail (optional, but safe to include)
    mx: {
      key: domain,
      value: "10 inbound-smtp.us-east-1.amazonaws.com",
    },
    // DKIM CNAMEs (3 values)
    cname: dkim.DkimTokens!.map((token) => ({
      key: `${token}._domainkey`,
      value: `${token}.dkim.amazonses.com`,
    })),
  };
}

export async function verifyDnsRecords(
  domain: string,
  expectedRecords: DnsRecords
): Promise<VerificationResult> {
  const result: VerificationResult = {
    verified: false,
    txtVerified: false,
    mxVerified: false,
    cnameVerified: false,
    cnameDetails: [],
    errors: [],
  };

  try {
    // Verify TXT record (SES token)
    result.txtVerified = await verifyTxtRecord(domain, expectedRecords.txt.value);

    // Verify MX record (optional if you only care about sending)
    result.mxVerified = await verifyMxRecord(domain, expectedRecords.mx.value);

    // Verify CNAME (DKIM) records
    const cnameResults = await Promise.all(
      expectedRecords.cname.map(async (record) => {
        const verified = await verifyCnameRecord(domain, record.key, record.value);
        return { ...record, verified };
      })
    );

    result.cnameDetails = cnameResults;
    result.cnameVerified = cnameResults.every((r) => r.verified);

    // Overall verification
    result.verified = result.txtVerified && result.cnameVerified;
  } catch (err) {
    result.errors.push(`DNS verification error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

// DNS Verification Helper Functions
async function verifyTxtRecord(domain: string, expectedValue: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(domain);
    return records.some(record => record.join('').includes(expectedValue));
  } catch (error) {
    return false;
  }
}

async function verifyMxRecord(domain: string, expectedValue: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return records.some(record => 
      `${record.priority} ${record.exchange}` === expectedValue
    );
  } catch (error) {
    return false;
  }
}

async function verifyCnameRecord(domain: string, recordKey: string, expectedValue: string): Promise<boolean> {
  try {
    const records = await dns.resolveCname(recordKey);
    return records.some(record => record === expectedValue);
  } catch (error) {
    return false;
  }
}

/**
 * Get all domains for a user (for use in other parts of the app)
 */
export async function getUserDomains(userId: string) {
  const { prisma } = await import('./prisma');
  
  return await prisma.domain.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      domain: true,
      status: true,
      createdAt: true,
      verifiedAt: true,
    },
  });
}