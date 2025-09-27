import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyDnsRecords } from "@/lib/domain-verification";
import {
  GetIdentityVerificationAttributesCommand,
  GetIdentityDkimAttributesCommand,
} from "@aws-sdk/client-ses";
import { sesClient } from "@/lib/ses";


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domainId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domainId } = await params;

    if (!domainId) {
      return NextResponse.json({ error: "Domain ID parameter required" }, { status: 400 });
    }

    // 1. Load domain record from DB by ID
    const domainRecord = await prisma.domain.findFirst({
      where: { id: domainId, userId: session.user.id },
    });

    if (!domainRecord) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // 2. Run local DNS checks
    const verificationStatus = await verifyDnsRecords(domainRecord.domain, {
      txt: { key: domainRecord.domain, value: domainRecord.txtRecord! },
      mx: { key: domainRecord.domain, value: domainRecord.mxRecord! },
      cname: [
        { key: domainRecord.cnameKey1!, value: domainRecord.cnameValue1! },
        { key: domainRecord.cnameKey2!, value: domainRecord.cnameValue2! },
        { key: domainRecord.cnameKey3!, value: domainRecord.cnameValue3! },
      ],
    });

    // 3. Ask SES for authoritative status
    const sesIdentityResp = await sesClient.send(
      new GetIdentityVerificationAttributesCommand({ Identities: [domainRecord.domain] })
    );
    const sesDkimResp = await sesClient.send(
      new GetIdentityDkimAttributesCommand({ Identities: [domainRecord.domain] })
    );

    const sesVerification = sesIdentityResp.VerificationAttributes?.[domainRecord.domain];
    const sesDkim = sesDkimResp.DkimAttributes?.[domainRecord.domain];

    const sesStatus = {
      domainStatus: sesVerification?.VerificationStatus ?? "PENDING",
      token: sesVerification?.VerificationToken ?? null,
      dkimEnabled: sesDkim?.DkimEnabled ?? false,
      dkimVerificationStatus: sesDkim?.DkimVerificationStatus ?? "PENDING",
      dkimTokens: sesDkim?.DkimTokens ?? [],
    };

    // 4. Update DB status if SES confirmed verification
    if (sesVerification?.VerificationStatus === "Success" && domainRecord.status !== "VERIFIED") {
      await prisma.domain.update({
        where: { id: domainRecord.id },
        data: { status: "VERIFIED", verifiedAt: new Date() },
      });
    }

    // 5. Respond with combined results
    return NextResponse.json({
      id: domainRecord.id,
      domain: domainRecord.domain,
      status: sesVerification?.VerificationStatus === "Success" ? "VERIFIED" : "PENDING",
      createdAt: domainRecord.createdAt.toISOString(),
      verifiedAt: domainRecord.verifiedAt?.toISOString(),
      dnsCheck: verificationStatus, // granular info (TXT, MX, CNAMEs)
      sesStatus, // authoritative SES info
      records: {
        txt: { key: domainRecord.domain, value: domainRecord.txtRecord! },
        mx: { key: domainRecord.domain, value: domainRecord.mxRecord! },
        cname: [
          { key: domainRecord.cnameKey1!, value: domainRecord.cnameValue1! },
          { key: domainRecord.cnameKey2!, value: domainRecord.cnameValue2! },
          { key: domainRecord.cnameKey3!, value: domainRecord.cnameValue3! },
        ],
      },
    });
  } catch (error) {
    console.error("Error fetching domain details:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}