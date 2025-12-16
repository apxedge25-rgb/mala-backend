import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

export function generateAccessToken(userId: string) {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: "7d" } // can change later
  );
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
}
