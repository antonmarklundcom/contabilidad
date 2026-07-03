import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "pdfkit",
    "bcryptjs",
    "archiver",
    "nodemailer",
    "facturacionelectronicapy-xmlgen",
    "facturacionelectronicapy-xmlsign",
    "facturacionelectronicapy-setapi",
    "facturacionelectronicapy-qrgen",
    "@prisma/client",
    "prisma",
  ],
  eslint: {
    // Lint runs separately via `npm run lint`; don't block prod builds.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
