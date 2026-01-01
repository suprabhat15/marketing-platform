import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/lists/[listId]/subscribers
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listId } = await params;

    // Verify user owns the list
    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session.user.id,
      },
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;

    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status") || "";

    const where: any = { listId };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const totalCount = await prisma.subscriber.count({ where });

    const subscribers = await prisma.subscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      subscribers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasMore: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching subscribers:", error);
    return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 });
  }
}

// POST /api/lists/[listId]/subscribers
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ Lazy import zod only when POST is called
    const { z } = await import("zod");

    const importSubscribersSchema = z.object({
      subscribers: z.array(
        z.object({
          email: z.string().email("Invalid email address"),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          status: z.enum(["ACTIVE", "UNSUBSCRIBED"]).optional(),
        })
      ),
    });

    const { listId } = await params;
    const body = await request.json();
    const { subscribers } = importSubscribersSchema.parse(body);

    // Verify user owns the list
    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session.user.id,
      },
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const existingSubscribers = await prisma.subscriber.findMany({
      where: { listId },
      select: { email: true },
    });

    const existingEmails = new Set(existingSubscribers.map((s) => s.email));
    const newSubscribers = subscribers.filter((s) => !existingEmails.has(s.email));

    if (newSubscribers.length === 0) {
      return NextResponse.json({
        message: "No new subscribers to import",
        imported: 0,
        duplicates: subscribers.length,
      });
    }

    const createdSubscribers = await prisma.subscriber.createMany({
      data: newSubscribers.map((subscriber) => ({
        email: subscriber.email,
        firstName: subscriber.firstName || "",
        lastName: subscriber.lastName || "",
        status: subscriber.status === "UNSUBSCRIBED" ? "UNSUBSCRIBED" : "ACTIVE",
        listId,
      })),
    });

    return NextResponse.json({
      message: "Subscribers imported successfully",
      imported: createdSubscribers.count,
      duplicates: subscribers.length - newSubscribers.length,
    });
  } catch (error: any) {
    // Handle zod validation errors
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error importing subscribers:", error);
    return NextResponse.json({ error: "Failed to import subscribers" }, { status: 500 });
  }
}
