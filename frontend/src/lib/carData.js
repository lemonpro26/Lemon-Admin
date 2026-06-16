// Vehicle data for the Lemon Pros qualification funnel.
// Years (newest → older), popular US car makes (with brand logos), and the
// common models for each make. Logos are served from a public car-logos CDN.

const LOGO_BASE =
  'https://raw.githubusercontent.com/filippofilip95/car-logos-dataset/master/logos/optimized';

export const makeLogo = (slug) => `${LOGO_BASE}/${slug}.png`;

// 2026 → 2000, then a catch-all bucket for anything older.
export const CAR_YEARS = (() => {
  const start = 2026;
  const end = 2000;
  const years = [];
  for (let y = start; y >= end; y -= 1) years.push(String(y));
  years.push('1999 or older');
  return years;
})();

// Popular makes (name + CDN logo slug), ordered by US market share / familiarity.
export const CAR_MAKES = [
  { name: 'Toyota', slug: 'toyota' },
  { name: 'Ford', slug: 'ford' },
  { name: 'Chevrolet', slug: 'chevrolet' },
  { name: 'Honda', slug: 'honda' },
  { name: 'Nissan', slug: 'nissan' },
  { name: 'Jeep', slug: 'jeep' },
  { name: 'Ram', slug: 'ram' },
  { name: 'GMC', slug: 'gmc' },
  { name: 'Dodge', slug: 'dodge' },
  { name: 'Hyundai', slug: 'hyundai' },
  { name: 'Kia', slug: 'kia' },
  { name: 'Subaru', slug: 'subaru' },
  { name: 'Volkswagen', slug: 'volkswagen' },
  { name: 'Mazda', slug: 'mazda' },
  { name: 'Tesla', slug: 'tesla' },
  { name: 'BMW', slug: 'bmw' },
  { name: 'Mercedes-Benz', slug: 'mercedes-benz' },
  { name: 'Lexus', slug: 'lexus' },
  { name: 'Audi', slug: 'audi' },
  { name: 'Acura', slug: 'acura' },
  { name: 'Cadillac', slug: 'cadillac' },
  { name: 'Chrysler', slug: 'chrysler' },
  { name: 'Buick', slug: 'buick' },
  { name: 'Lincoln', slug: 'lincoln' },
  { name: 'Volvo', slug: 'volvo' },
  { name: 'Land Rover', slug: 'land-rover' },
  { name: 'Porsche', slug: 'porsche' },
  { name: 'Mitsubishi', slug: 'mitsubishi' },
  { name: 'Infiniti', slug: 'infiniti' },
  { name: 'MINI', slug: 'mini' },
  { name: 'Genesis', slug: 'genesis' },
  { name: 'Fiat', slug: 'fiat' },
].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

// Common models per make. "Other / Not listed" is appended automatically.
export const CAR_MODELS = {
  Toyota: ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Tacoma', 'Tundra', '4Runner', 'Prius', 'Sienna', 'Sequoia'],
  Ford: ['F-150', 'F-250', 'Escape', 'Explorer', 'Mustang', 'Bronco', 'Edge', 'Ranger', 'Expedition', 'Maverick'],
  Chevrolet: ['Silverado', 'Equinox', 'Tahoe', 'Traverse', 'Malibu', 'Camaro', 'Colorado', 'Suburban', 'Blazer', 'Corvette'],
  Honda: ['Accord', 'Civic', 'CR-V', 'Pilot', 'Odyssey', 'HR-V', 'Ridgeline', 'Passport'],
  Nissan: ['Altima', 'Rogue', 'Sentra', 'Pathfinder', 'Frontier', 'Titan', 'Murano', 'Kicks', 'Maxima'],
  Jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Gladiator', 'Renegade', 'Wagoneer'],
  Ram: ['1500', '2500', '3500', 'ProMaster'],
  GMC: ['Sierra', 'Acadia', 'Terrain', 'Yukon', 'Canyon', 'Hummer EV'],
  Dodge: ['Charger', 'Challenger', 'Durango', 'Hornet'],
  Hyundai: ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Palisade', 'Kona', 'Venue', 'Ioniq 5'],
  Kia: ['Forte', 'K5', 'Sportage', 'Sorento', 'Telluride', 'Soul', 'Seltos', 'Carnival', 'EV6'],
  Subaru: ['Outback', 'Forester', 'Crosstrek', 'Impreza', 'Ascent', 'Legacy', 'WRX'],
  Volkswagen: ['Jetta', 'Tiguan', 'Atlas', 'Passat', 'Golf', 'Taos', 'ID.4'],
  Mazda: ['Mazda3', 'CX-5', 'CX-30', 'CX-50', 'CX-90', 'MX-5 Miata', 'Mazda6'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
  BMW: ['3 Series', '5 Series', 'X3', 'X5', 'X1', 'X7', '4 Series', 'i4'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'GLC', 'GLE', 'GLA', 'S-Class', 'A-Class', 'GLB'],
  Lexus: ['RX', 'NX', 'ES', 'GX', 'IS', 'UX', 'TX', 'LX'],
  Audi: ['A4', 'A6', 'Q5', 'Q7', 'Q3', 'A3', 'Q8', 'e-tron'],
  Acura: ['MDX', 'RDX', 'TLX', 'Integra', 'ILX'],
  Cadillac: ['Escalade', 'XT5', 'XT4', 'CT5', 'XT6', 'Lyriq'],
  Chrysler: ['Pacifica', '300', 'Voyager'],
  Buick: ['Encore', 'Enclave', 'Envision', 'Envista'],
  Lincoln: ['Corsair', 'Nautilus', 'Aviator', 'Navigator'],
  Volvo: ['XC90', 'XC60', 'XC40', 'S60', 'S90', 'V60'],
  'Land Rover': ['Range Rover', 'Range Rover Sport', 'Discovery', 'Defender', 'Velar', 'Evoque'],
  Porsche: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', '718'],
  Mitsubishi: ['Outlander', 'Eclipse Cross', 'Mirage', 'Outlander Sport'],
  Infiniti: ['QX60', 'QX50', 'QX80', 'Q50', 'QX55'],
  MINI: ['Cooper', 'Countryman', 'Clubman'],
  Genesis: ['G70', 'G80', 'G90', 'GV70', 'GV80'],
  Fiat: ['500X', '500', '500e'],
};

export function getModels(makeName) {
  const list = CAR_MODELS[makeName] ? [...CAR_MODELS[makeName]] : [];
  list.push('Other / Not listed');
  return list;
}
