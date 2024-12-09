/** @type {import('next').NextConfig} */
const nextConfig = {
    env:{
        DATABASE_URL: process.env.DATABASE_URL,
        WEB3_AUTH_CLIENTID: process.env.WEB3_AUTH_CLIENTID,
    },
};

export default nextConfig;
