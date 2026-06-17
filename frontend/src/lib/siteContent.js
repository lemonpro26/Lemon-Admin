// Company NAP (Name, Address, Phone) + legal contact details — single source of truth.
export const COMPANY = {
  name: 'Lemon Pros',
  address: '9025 Wilshire Blvd #500, Beverly Hills, CA 90211',
  addressLine1: '9025 Wilshire Blvd #500',
  addressLine2: 'Beverly Hills, CA 90211',
  phone: '844-335-8911',
  phoneHref: 'tel:+18443358911',
  contactEmail: 'info@lemonpros.com',
  legalEmail: 'info@lemonpros.com',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=9025+Wilshire+Blvd+%23500+Beverly+Hills+CA+90211',
};

// Legal documents rendered on /terms, /privacy, /do-not-sell.
// block types: 'p' (paragraph), 'h' (sub-heading), 'ul' (bullet list), 'email'
export const LEGAL_DOCS = {
  terms: {
    title: 'Terms of Use',
    effective: 'June 5, 2026',
    intro:
      'Welcome to Lemon Pros. By accessing or using our website or submitting a case review request, you agree to be bound by these Terms of Use ("Terms"). Please read them carefully. Lemon Pros is a lead-generation and consumer-advocacy service that connects consumers with independent lemon-law attorneys. We are not a law firm and do not provide legal advice.',
    blocks: [
      { type: 'h', text: '1.1 Acceptance of Terms' },
      { type: 'p', text: 'By browsing our website or submitting your vehicle and contact information, you signify your agreement to these Terms, all applicable laws, and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.' },
      { type: 'h', text: '1.2 Nature of Service' },
      { type: 'p', text: 'Lemon Pros helps consumers determine whether their defective vehicle may qualify under applicable state lemon laws and connects them, free of charge, with independent law firms that may evaluate and pursue their claim. Submitting a request does not create an attorney-client relationship and does not guarantee that any firm will accept your case or that you will recover any compensation.' },
      { type: 'h', text: '1.3 No Legal Advice' },
      { type: 'p', text: 'Information on this website is provided for general informational purposes only and is not legal advice. This website may be considered attorney advertising in some jurisdictions. Prior results do not guarantee a similar outcome.' },
      { type: 'h', text: '1.4 User Conduct' },
      { type: 'p', text: 'When submitting a request, you agree to provide true, accurate, and current information. You may not use the site to submit fraudulent, malicious, or misleading requests, or attempt to compromise website security.' },
      { type: 'h', text: '1.5 Limitation of Liability' },
      { type: 'p', text: 'In no event shall Lemon Pros or its affiliates be liable for any damages arising out of the use or inability to use the materials on the website, even if notified of the possibility of such damage.' },
      { type: 'h', text: '1.6 Modifications to Terms' },
      { type: 'p', text: 'We reserve the right to revise these terms at any time without notice. By using this website, you agree to be bound by the then-current version of these Terms.' },
      { type: 'h', text: '1.7 Contact Information' },
      { type: 'p', text: 'Please address all inquiries regarding these terms to:' },
      { type: 'email', text: 'info@lemonpros.com' },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    effective: 'June 5, 2026',
    intro:
      'At Lemon Pros, we value your trust and are committed to protecting your personal privacy. This Privacy Policy outlines the information we collect, how it is used, and the safeguards we maintain to keep your data secure.',
    blocks: [
      { type: 'h', text: '2.1 Information We Collect' },
      { type: 'p', text: 'To evaluate your potential lemon-law claim and connect you with the right legal team, we collect information you provide directly, including:' },
      { type: 'ul', items: [
        'Vehicle Information: Year, make, and model of your vehicle.',
        'Contact Information: Full name, phone number, email address, and mailing address.',
        'Technical Data: IP address, device type, and basic analytics used to operate the website and prevent abuse.',
      ] },
      { type: 'h', text: '2.2 How We Use Your Information' },
      { type: 'p', text: 'Your information is used to:' },
      { type: 'ul', items: [
        'Determine whether your vehicle may qualify under applicable lemon laws.',
        'Connect you with independent law firms for a free case review.',
        'Respond to your questions and provide service updates by phone, text, or email.',
      ] },
      { type: 'h', text: '2.3 Information Sharing' },
      { type: 'p', text: 'We share the information you submit with one or more independent law firms or legal-service partners for the purpose of evaluating and, if appropriate, pursuing your claim. We do not sell your information to unrelated third-party marketers.' },
      { type: 'h', text: '2.4 Data Security' },
      { type: 'p', text: 'We employ standard commercial security practices to safeguard your information. No transmission method over the internet is completely secure, but we take every reasonable measure to protect your data.' },
      { type: 'h', text: '2.5 Contact Information' },
      { type: 'p', text: 'For data updates, deletion requests, or privacy inquiries, email us at:' },
      { type: 'email', text: 'info@lemonpros.com' },
    ],
  },
  'do-not-sell': {
    title: 'Do Not Sell My Personal Information',
    effective: 'June 5, 2026',
    intro:
      'Our Promise: Lemon Pros does not sell your personal data to unrelated third-party marketers or data brokers. Your information is used to evaluate your potential lemon-law claim and connect you with legal help.',
    blocks: [
      { type: 'h', text: '3.1 Compliance Notice' },
      { type: 'p', text: 'State privacy laws, including the California Consumer Privacy Act (CCPA), grant consumers the right to opt out of the "sale" or "sharing" of their personal information. Lemon Pros does not sell your personal information to unrelated marketers.' },
      { type: 'h', text: '3.2 How Your Data Is Used' },
      { type: 'p', text: 'The information you provide is shared only with the independent law firms and service partners necessary to review and pursue your potential claim. It is not used for unrelated third-party advertising networks.' },
      { type: 'h', text: '3.3 Right to Know and Delete' },
      { type: 'p', text: 'At any time, you have the right to request that we:' },
      { type: 'ul', items: [
        'Disclose what information we hold about you.',
        'Permanently delete your records from our systems (except where retention is legally required).',
      ] },
      { type: 'h', text: '3.4 Exercise Your Data Rights' },
      { type: 'p', text: 'To request access to or removal of your data, contact us at:' },
      { type: 'email', text: 'info@lemonpros.com' },
    ],
  },
};
