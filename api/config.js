// Hosted: Spotify login works, but new songs are made by the app on the Mac (can_make: false).
export function GET() {
  return Response.json({spotify_client_id: process.env.SPOTIFY_CLIENT_ID || "", can_make: false});
}
