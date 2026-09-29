/** Folio's privacy policy, in the page's own module so its text isn't part of every page's first load. */
export const policy = {
  updated: 'Last updated 29 September 2026',
  lede: 'You don’t need an account to use Folio: without one, your courses stay in your browser. If you choose to sign in, your courses are also kept in your account, so they’re on every device you use.',
  sections: [
    {
      heading: 'What stays on your device',
      body: 'Your courses, drafts, attached files and settings are stored in this browser. If you don’t sign in, we can’t see them, and a browser that has never signed in never contacts Folio’s server. Clearing your browser data removes them, so save a backup file from the Library if you want a copy.',
    },
    {
      heading: 'If you sign in',
      body: 'Signing in is optional and uses your Google account. Folio receives your name, your email address and Google’s ID for your account, and nothing else from Google. It keeps the courses you choose to put in your account (their content, sources and edit history) on Folio’s servers, run by Cloudflare, so they are on any device you sign in on. If you write with your own AI key, it is never sent to Folio: it stays in each browser. A session cookie keeps you signed in; it is used for nothing else. Signing out removes your account’s courses from that browser; they stay in your account. Deleting your account in Settings deletes it and every course in it from Folio’s servers, and ends any Folio credits left in it (see the Terms).',
    },
    {
      heading: 'Your AI key',
      body: 'The key you enter is kept only in this browser. When Folio writes, your browser sends your course description, the files you attach and the key straight to the AI company you chose (Anthropic, OpenAI, Google or DeepSeek), or to a model on your own computer. That company’s privacy policy covers the request. Folio never receives it.',
    },
    {
      heading: 'Folio credits',
      body: 'If you write with Folio credits instead of your own key, your browser sends each request (your course description, the files you attach and the course so far) to Folio’s server, which passes it to Anthropic with Folio’s key and returns the answer. Folio doesn’t keep the requests or answers: it records only how many tokens each one used, to take its cost from your credits. Anthropic’s commercial terms apply to the request, and Anthropic doesn’t train its models on it. Your balance, the free credits you were given and any credits you bought are kept with your account.',
    },
    {
      heading: 'Google Drive',
      body: 'If you export to Google Docs, Google asks you to let Folio create files in your Drive. Folio asks only for the drive.file permission, so it can see and change only the files it creates for you, never the rest of your Drive. Your browser uses that permission to upload the document; Folio keeps no copy and doesn’t store your sign-in. You can remove access at any time in your Google Account.',
    },
    {
      heading: 'Google API data',
      body: 'Folio’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Your Google sign-in is used only to identify your account in Folio.',
    },
    {
      heading: 'What a course cost',
      body: 'To tell you what a course cost, or how many credits it used, Folio counts the tokens the AI company reports for each request and prices them with the public list at openrouter.ai, read when the course is finished. That request carries nothing about you or your course.',
    },
    {
      heading: 'What we don’t do',
      body: 'No ads, no tracking, no analytics cookies. Nothing is sold or shared, and your courses are never used to train AI. The site is served by Cloudflare, which handles requests the way any web host does.',
    },
    {
      heading: 'Questions',
      body: 'Write to xingpicture@gmail.com.',
    },
  ],
};
