import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/session';

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.nextUrl.origin), 303);
  res.cookies.delete(sessionCookie.name);
  return res;
}
