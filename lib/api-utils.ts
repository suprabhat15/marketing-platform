// Lightweight API utilities without heavy imports
import { NextRequest, NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export function createErrorResponse(error: string, status: number = 500): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function createSuccessResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function createMessageResponse(message: string, status: number = 200): NextResponse {
  return NextResponse.json({ message }, { status });
}

// Simple validation helpers without Zod overhead
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateRequired(value: any, fieldName: string): void {
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    throw new Error(`${fieldName} is required`);
  }
}

export function validateStringLength(value: string, min: number, max: number, fieldName: string): void {
  if (value.length < min || value.length > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max} characters`);
  }
}

// Parse JSON with error handling
export async function parseRequestBody<T = any>(request: NextRequest): Promise<T> {
  try {
    return await request.json();
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
}

// Extract URL params helper
export function getSearchParam(request: NextRequest, param: string): string | null {
  const { searchParams } = new URL(request.url);
  return searchParams.get(param);
}

export function getPaginationParams(request: NextRequest) {
  const page = Math.max(1, parseInt(getSearchParam(request, 'page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(getSearchParam(request, 'limit') || '25')));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}