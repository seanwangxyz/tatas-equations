// Accounts and cloud save (see docs/handoff/account.md).
// Each sign-in method shows only when it is switched on here AND in the Firebase console
// (Authentication -> Sign-in method). Google is the family's choice; email + password is ready as a spare.
//   google: "Continue with Google" (a pop-up; on iPad Safari or when pop-ups are blocked it moves to a full-page sign-in)
//   email:  email + password (meant for a parent's email), with "Forgot password?"
// Both false: no Account card anywhere, and the game works exactly as before.
// Testing on one computer without Firebase: open the game with ?accounttest=1&dev=a and ?accounttest=1&dev=b
// (two pretend devices; both methods show in that mode).
// DIRECT GOOGLE SIGN-IN (iPad / iPhone / Safari, a home-screen app, or a blocked pop-up): the whole page goes to Google
// and comes straight back to googleReturn with a signed token (js/account.js). googleClientId is the Firebase
// project's Web client id (a public value, the same one Firebase's own sign-in uses). googleReturn must be listed
// under that client's "Authorized redirect URIs" in the Google Cloud console (APIs & Services -> Credentials ->
// "Web client (auto created by Google Service)"). googleDirect: 'safari' | 'always' | 'off'.
window.ACCOUNT_CONFIG = { google: true, email: false,
  googleClientId: '1034612744136-rbvi208ojevgsmcuq1thjbfearikl7ld.apps.googleusercontent.com',
  googleReturn: 'https://profsean.wang/tatas-equations/', googleDirect: 'safari' };
