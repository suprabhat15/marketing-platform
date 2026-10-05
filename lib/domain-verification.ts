import { promises as dns } from 'dns';
import { VerifyDomainIdentityCommand, VerifyDomainDkimCommand } from "@aws-sdk/client-ses";
// import type { DnsRecords, VerificationResult } from "./domain-verification";
import { sesClient } from "./ses"
import { invalidateUserCache } from './redis-cache';
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
  mailFromMx: {
    key: string;
    value: string;
  };
  mailFromTxt: {
    key: string;
    value: string;
  };
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
  mailFromMxVerified: boolean;
  mailFromTxtVerified: boolean;
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

  // 3. Derive region-specific endpoints from configured AWS region
  const region = process.env.AWS_REGION || "us-east-1";

  // 4. Build records
  return {
    // TXT verification token SES expects
    txt: {
      key: domain,
      value: `amazonses:${identity.VerificationToken}`,
    },
    // MX record for SES inbound mail (optional, but safe to include)
    mx: {
      key: domain,
      value: `10 inbound-smtp.${region}.amazonaws.com`,
    },
    // DKIM CNAMEs (3 values)
    cname: dkim.DkimTokens!.map((token) => ({
      key: `${token}._domainkey`,
      value: `${token}.dkim.amazonses.com`,
    })),
    // MAIL FROM domain MX record
    mailFromMx: {
      key: "mail",
      value: `10 feedback-smtp.${region}.amazonses.com`,
    },
    // MAIL FROM domain SPF TXT record
    mailFromTxt: {
      key: "mail",
      value: "v=spf1 include:amazonses.com ~all",
    },
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
    mailFromMxVerified: false,
    mailFromTxtVerified: false,
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
        const verified = await verifyCnameRecord(record.key, record.value);
        return { ...record, verified };
      })
    );

    result.cnameDetails = cnameResults;
    result.cnameVerified = cnameResults.every((r) => r.verified);

    // Verify MAIL FROM MX record (key is "mail", resolve against mail.{domain})
    const mailFromDomain = `${expectedRecords.mailFromMx.key}.${domain}`;
    result.mailFromMxVerified = await verifyMxRecord(mailFromDomain, expectedRecords.mailFromMx.value);

    // Verify MAIL FROM SPF TXT record
    result.mailFromTxtVerified = await verifyTxtRecord(mailFromDomain, expectedRecords.mailFromTxt.value);

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

async function verifyCnameRecord(recordKey: string, expectedValue: string): Promise<boolean> {
  try {
    const records = await dns.resolveCname(recordKey);
    return records.some(record => record === expectedValue);
  } catch (error) {
    return false;
  }
}

/** Persist observed SES transitions before invalidating domain lists. */
export async function syncDomainVerificationStatus<T extends {
  id: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  verifiedAt: Date | null;
}>(userId: string, domain: T, sesStatus: string | undefined): Promise<T> {
  const status = sesStatus === 'Success' ? 'VERIFIED'
    : sesStatus === 'Failed' ? 'FAILED'
    : sesStatus === 'Pending' ? 'PENDING'
    : domain.status;
  if (status === domain.status) return domain;

  const { prisma } = await import('./prisma');
  const verifiedAt = status === 'VERIFIED' ? new Date() : null;
  await prisma.domain.update({
    where: { id: domain.id },
    data: { status, verifiedAt },
  });
  await invalidateUserCache(userId, 'domains');
  return { ...domain, status, verifiedAt };
}

/**
 * Get all domains for a user (for use in other parts of the app)
 */
export async function getUserDomains(userId: string) {
  const { prisma } = await import('./prisma');
  const { GetIdentityVerificationAttributesCommand } = await import('@aws-sdk/client-ses');
  
  const domains = await prisma.domain.findMany({
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

  // Check SES status for all domains to get real-time verification status
  try {
    const domainNames = domains.map(d => d.domain);
    if (domainNames.length > 0) {
      const sesResponse = await sesClient.send(
        new GetIdentityVerificationAttributesCommand({ Identities: domainNames })
      );
      
      // Update domains with real-time SES status
      const updatedDomains = await Promise.all(domains.map(async (domain) => {
        const sesVerification = sesResponse.VerificationAttributes?.[domain.domain];
        const sesStatus = sesVerification?.VerificationStatus;
        
        return syncDomainVerificationStatus(userId, domain, sesStatus);
      }));
      
      return updatedDomains;
    }
  } catch (error) {
    console.error('Error fetching SES verification status:', error);
    // Fall back to database status if SES check fails
  }
  
  return domains;
}
