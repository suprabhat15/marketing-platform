import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { domain } = body;

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const domainNormalized = domain.toLowerCase();

    const domainRegex = /^(?!-)([a-zA-Z0-9-]{1,63}(?<!-)\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domainNormalized) || domainNormalized.length > 253) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }

    const { generateDnsRecords } = await import("@/lib/domain-verification");

    const dnsRecords = await generateDnsRecords(domainNormalized);

    // Check if domain already exists for this user
    const existingDomain = await prisma.domain.findFirst({
      where: { domain: domainNormalized, userId: session.user.id },
    });

    if (existingDomain) {
      return NextResponse.json(
        { error: "Please enter unique domain" },
        { status: 400 }
      );
    }

    // Store domain in database
    const domainRecord = await prisma.domain.create({
      data: {
        domain: domainNormalized,
        userId: session.user.id,
        status: "PENDING",
        txtRecord: dnsRecords.txt.value,
        mxRecord: dnsRecords.mx.value,
        cnameKey1: dnsRecords.cname[0]?.key,
        cnameValue1: dnsRecords.cname[0]?.value,
        cnameKey2: dnsRecords.cname[1]?.key,
        cnameValue2: dnsRecords.cname[1]?.value,
        cnameKey3: dnsRecords.cname[2]?.key,
        cnameValue3: dnsRecords.cname[2]?.value,
        mailFromMxRecord: dnsRecords.mailFromMx.value,
        mailFromTxtRecord: dnsRecords.mailFromTxt.value,
      },
    });

    return NextResponse.json({
      domain: domainNormalized,
      records: dnsRecords,
      id: domainRecord.id,
    });
  } catch (error) {
    console.error("Error creating domain verification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");
    if (!domain) {
      return NextResponse.json(
        { error: "Domain parameter required" },
        { status: 400 }
      );
    }

    // 1. Load domain record from DB
    const domainRecord = await prisma.domain.findFirst({
      where: { domain, userId: session.user.id },
    });
    if (!domainRecord) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // 2. Check if DNS records are properly populated
    if (!domainRecord.txtRecord || !domainRecord.mxRecord || 
        !domainRecord.cnameKey1 || !domainRecord.cnameValue1 ||
        !domainRecord.cnameKey2 || !domainRecord.cnameValue2 ||
        !domainRecord.cnameKey3 || !domainRecord.cnameValue3) {
      return NextResponse.json({ 
        error: "Domain verification records not properly initialized" 
      }, { status: 400 });
    }

    // 3. Lazy import DNS verification (keeps bundle light)
    const { verifyDnsRecords } = await import("@/lib/domain-verification");
    const verificationStatus = await verifyDnsRecords(domain, {
      txt: { key: domain, value: domainRecord.txtRecord },
      mx: { key: domain, value: domainRecord.mxRecord },
      cname: [
        { key: domainRecord.cnameKey1, value: domainRecord.cnameValue1 },
        { key: domainRecord.cnameKey2, value: domainRecord.cnameValue2 },
        { key: domainRecord.cnameKey3, value: domainRecord.cnameValue3 },
      ],
      mailFromMx: { key: "mail", value: domainRecord.mailFromMxRecord! },
      mailFromTxt: { key: "mail", value: domainRecord.mailFromTxtRecord! },
    });

    // 3. Lazy import AWS SDK only when needed
    const { GetIdentityVerificationAttributesCommand, GetIdentityDkimAttributesCommand, SetIdentityMailFromDomainCommand } =
      await import("@aws-sdk/client-ses");
    const { sesClient } = await import("@/lib/ses");

    const sesIdentityResp = await sesClient.send(
      new GetIdentityVerificationAttributesCommand({ Identities: [domain] })
    );
    const sesDkimResp = await sesClient.send(
      new GetIdentityDkimAttributesCommand({ Identities: [domain] })
    );

    const sesVerification = sesIdentityResp.VerificationAttributes?.[domain];
    const sesDkim = sesDkimResp.DkimAttributes?.[domain];

    const sesStatus = {
      domainStatus: sesVerification?.VerificationStatus ?? "PENDING",
      token: sesVerification?.VerificationToken ?? null,
      dkimEnabled: sesDkim?.DkimEnabled ?? false,
      dkimVerificationStatus: sesDkim?.DkimVerificationStatus ?? "PENDING",
      dkimTokens: sesDkim?.DkimTokens ?? [],
    };

    // 4. Update DB status if SES confirmed verification
    if (
      sesVerification?.VerificationStatus === "Success" &&
      domainRecord.status !== "VERIFIED"
    ) {
      // Configure custom MAIL FROM domain in SES with fallback to default on MX failure
      await sesClient.send(
        new SetIdentityMailFromDomainCommand({
          Identity: domain,
          MailFromDomain: `mail.${domain}`,
          BehaviorOnMXFailure: "UseDefaultValue",
        })
      );

      await prisma.domain.update({
        where: { id: domainRecord.id },
        data: { status: "VERIFIED", verifiedAt: new Date() },
      });
    }

    // 5. Respond with combined results
    return NextResponse.json({
      domain,
      status:
        sesVerification?.VerificationStatus === "Success"
          ? "VERIFIED"
          : "PENDING",
      dnsCheck: verificationStatus,
      sesStatus,
      records: {
        txt: { key: domain, value: domainRecord.txtRecord },
        mx: { key: domain, value: domainRecord.mxRecord },
        cname: [
          { key: domainRecord.cnameKey1, value: domainRecord.cnameValue1 },
          { key: domainRecord.cnameKey2, value: domainRecord.cnameValue2 },
          { key: domainRecord.cnameKey3, value: domainRecord.cnameValue3 },
        ],
        mailFromMx: { key: "mail", value: domainRecord.mailFromMxRecord },
        mailFromTxt: { key: "mail", value: domainRecord.mailFromTxtRecord },
      },
    });
  } catch (error) {
    console.error("Error checking domain verification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
