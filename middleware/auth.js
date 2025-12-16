import jwt from "jsonwebtoken";

export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "missing_auth_header" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "invalid_auth_format" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decoded.userId;

    next();
  } catch (err) {
    console.error("JWT auth failed:", err.message);
    return res.status(401).json({ error: "invalid_or_expired_token" });
  }
}
