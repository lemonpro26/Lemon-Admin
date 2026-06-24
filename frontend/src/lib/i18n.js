// Lightweight i18n for the public funnel. English + Spanish.
// The active language lives in FunnelContext (persisted), set by the landing
// page the visitor entered from ('/' = en, '/sp' = es).

export const STRINGS = {
  en: {
    header: { back: 'Back', secure: 'Your information is safe and secure', secureShort: 'Secure', callNow: 'Call Now' },
    footer: {
      terms: 'Terms of Use',
      dns: 'Do Not Sell My Info',
      privacy: 'Privacy',
      contact: 'Contact Us',
      rights: 'All rights reserved. Attorney advertising. Michael Saeedian, Esq.',
    },
    landing: {
      defaultHook1: 'Stuck With a Lemon? You May Be Owed Money.',
      defaultHook2:
        'Find out in 60 seconds if your defective vehicle qualifies for a refund, replacement, or cash compensation — at no cost to you.',
      tooltip: 'Takes 60 seconds — see if you qualify!',
      cta: 'Check If Your Car Qualifies',
      rated: '5-Star Rated',
      freeConsult: '100% Free Consultation',
      noWinNoFee: 'No Win, No Fee',
    },
    steps: {
      year: { q: 'What year is your vehicle?', sub: 'Select the model year of your vehicle.' },
      make: { q: "What's the make of your vehicle?", sub: 'Choose your vehicle manufacturer.' },
      model: { q: 'Which model do you drive?', sub: 'Select your vehicle model.' },
      name: { q: 'What is your name?', sub: 'Your information is safe & secure.' },
      address: { q: "What's your address?", sub: 'Used to match you with the right lemon-law team.' },
      phone: { q: "What's the best phone number to reach you?", sub: 'A specialist will call to review your case — free of charge.' },
      email: { q: 'Last step — where should we send your free case review?', sub: 'We take privacy seriously. No spam, ever.' },
    },
    fields: {
      firstName: 'First Name', lastName: 'Last Name', street: 'Street Address',
      city: 'City', state: 'State', zip: 'ZIP', phone: 'Phone Number', email: 'Email',
      firstPh: 'John', lastPh: 'Smith', streetPh: '123 Main St', cityPh: 'City', statePh: 'CA',
      zipPh: '90015', phonePh: '(555) 123-4567', emailPh: 'you@email.com',
    },
    buttons: { continue: 'Continue', verifying: 'Verifying…', checking: 'Checking…', submitting: 'Submitting…', submit: 'See If I Qualify' },
    errors: {
      first: 'Please enter your first name.',
      last: 'Please enter your last name.',
      street: 'Please enter your street address.',
      zip: 'Please enter a valid 5-digit ZIP code.',
      addrUnverified: "We couldn't verify that address. Please double-check and try again.",
      phone: 'Please enter a valid phone number.',
      phoneReal: "That doesn't look like a real phone number. Please enter a valid number.",
      email: 'Please enter a valid email address.',
      emailUndeliverable: "That email domain doesn't accept mail. Please check for typos.",
      submit: 'Something went wrong submitting your request. Please try again.',
    },
    consent:
      'By clicking the button above, I provide my electronic signature authorizing Lemon Pros and its affiliated law firms to contact me by phone, text, and email at the number and address provided, including via automated technology and pre-recorded messages, even if my number is on a Do-Not-Call list. This is legal advertising and not a guarantee of any outcome. Consent is not a condition of any purchase. Message and data rates may apply. You may revoke consent at any time. You also agree to our',
    consentTerms: 'terms', consentAnd: 'and', consentPrivacy: 'privacy policy',
    thankyou: {
      title: "You're all set!",
      body:
        'Thanks for your request. A Lemon Pros case specialist will reach out shortly to review your vehicle and explain your options — your consultation is 100% free.',
      expectCall: 'Expect a call from a lemon-law specialist.',
      sameDay: 'Most case reviews are completed same day.',
      backHome: 'Back to Home',
    },
  },

  es: {
    header: { back: 'Atrás', secure: 'Su información está segura y protegida', secureShort: 'Seguro', callNow: 'Llame Ahora' },
    footer: {
      terms: 'Términos de Uso',
      dns: 'No Vender Mi Información',
      privacy: 'Privacidad',
      contact: 'Contáctenos',
      rights: 'Todos los derechos reservados. Publicidad de abogados. Michael Saeedian, Esq.',
    },
    landing: {
      defaultHook1: '¿Atrapado con un Auto Defectuoso? Podría Tener Derecho a una Compensación.',
      defaultHook2:
        'Averigüe en 60 segundos si su vehículo defectuoso califica para un reembolso, reemplazo o compensación en efectivo — sin costo alguno para usted.',
      tooltip: 'Toma 60 segundos — ¡vea si califica!',
      cta: 'Verifique Si Su Auto Califica',
      rated: 'Calificación 5 Estrellas',
      freeConsult: 'Consulta 100% Gratis',
      noWinNoFee: 'Si No Gana, No Paga',
    },
    steps: {
      year: { q: '¿De qué año es su vehículo?', sub: 'Seleccione el año de su vehículo.' },
      make: { q: '¿Cuál es la marca de su vehículo?', sub: 'Elija el fabricante de su vehículo.' },
      model: { q: '¿Qué modelo conduce?', sub: 'Seleccione el modelo de su vehículo.' },
      name: { q: '¿Cuál es su nombre?', sub: 'Su información está segura y protegida.' },
      address: { q: '¿Cuál es su dirección?', sub: 'La usamos para asignarle el equipo de ley limón adecuado.' },
      phone: { q: '¿Cuál es el mejor número para contactarlo?', sub: 'Un especialista lo llamará para revisar su caso — sin costo.' },
      email: { q: 'Último paso — ¿a dónde enviamos su revisión gratuita?', sub: 'Nos tomamos su privacidad en serio. Nunca enviamos spam.' },
    },
    fields: {
      firstName: 'Nombre', lastName: 'Apellido', street: 'Dirección',
      city: 'Ciudad', state: 'Estado', zip: 'Código Postal', phone: 'Número de Teléfono', email: 'Correo Electrónico',
      firstPh: 'Juan', lastPh: 'Pérez', streetPh: 'Calle Principal 123', cityPh: 'Ciudad', statePh: 'CA',
      zipPh: '90015', phonePh: '(555) 123-4567', emailPh: 'usted@correo.com',
    },
    buttons: { continue: 'Continuar', verifying: 'Verificando…', checking: 'Comprobando…', submitting: 'Enviando…', submit: 'Ver Si Califico' },
    errors: {
      first: 'Por favor ingrese su nombre.',
      last: 'Por favor ingrese su apellido.',
      street: 'Por favor ingrese su dirección.',
      zip: 'Por favor ingrese un código postal válido de 5 dígitos.',
      addrUnverified: 'No pudimos verificar esa dirección. Por favor revísela e intente de nuevo.',
      phone: 'Por favor ingrese un número de teléfono válido.',
      phoneReal: 'Eso no parece un número de teléfono real. Por favor ingrese un número válido.',
      email: 'Por favor ingrese un correo electrónico válido.',
      emailUndeliverable: 'Ese dominio de correo no acepta mensajes. Por favor revise si hay errores.',
      submit: 'Algo salió mal al enviar su solicitud. Por favor intente de nuevo.',
    },
    consent:
      'Al hacer clic en el botón de arriba, proporciono mi firma electrónica autorizando a Lemon Pros y a sus firmas de abogados afiliadas a contactarme por teléfono, mensaje de texto y correo electrónico al número y la dirección proporcionados, incluso mediante tecnología automatizada y mensajes pregrabados, aunque mi número esté en una lista de No Llamar. Esto es publicidad legal y no garantiza ningún resultado. El consentimiento no es condición para ninguna compra. Pueden aplicar tarifas de mensajes y datos. Puede revocar el consentimiento en cualquier momento. También acepta nuestros',
    consentTerms: 'términos', consentAnd: 'y', consentPrivacy: 'política de privacidad',
    thankyou: {
      title: '¡Todo listo!',
      body:
        'Gracias por su solicitud. Un especialista de casos de Lemon Pros se comunicará con usted pronto para revisar su vehículo y explicarle sus opciones — su consulta es 100% gratis.',
      expectCall: 'Espere una llamada de un especialista en ley limón.',
      sameDay: 'La mayoría de las revisiones se completan el mismo día.',
      backHome: 'Volver al Inicio',
    },
  },
};

export const tr = (lang) => STRINGS[lang] || STRINGS.en;
