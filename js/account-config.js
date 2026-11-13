// Accounts and cloud save (see docs/handoff/account.md).
// Each sign-in method shows only when it is switched on here AND in the Firebase console
// (Authentication -> Sign-in method). Google is the family's choice; email + password is ready as a spare.
//   google: "Continue with Google" (a pop-up; on iPad Safari or when pop-ups are blocked it moves to a full-page sign-in)
//   email:  email + password (meant for a parent's email), with "Forgot password?"
// Both false: no Account card anywhere, and the game works exactly as before.
// Testing on one computer without Firebase: open the game with ?accounttest=1&dev=a and ?accounttest=1&dev=b
// (two pretend devices; both methods show in that mode).
window.ACCOUNT_CONFIG = { google: true, email: false };
