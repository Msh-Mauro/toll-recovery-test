// Step 1 of OAuth — redirect user to Zubie authorization page
// Visit http://localhost:3000/api/auth/login to kick off the flow

export function GET() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ZUBIE_CLIENT_ID,
    redirect_uri: process.env.ZUBIE_REDIRECT_URI,
    state: 'toll-test',
  });

  const url = `https://login.zubiecar.com/authorize?${params}`;
  return Response.redirect(url);
}
