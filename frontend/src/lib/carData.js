// Vehicle data for the Lemon Pros qualification funnel.
// Years (2026 → 2021), popular US car makes (with brand logos), and the
// current-lineup models for each make (focused on 2021-and-newer vehicles).
// Logos are served from a public car-logos CDN.

const LOGO_BASE =
  'https://raw.githubusercontent.com/filippofilip95/car-logos-dataset/master/logos/optimized';

export const makeLogo = (slug) => `${LOGO_BASE}/${slug}.png`;

// 2026 → 2021 (newest first).
export const CAR_YEARS = (() => {
  const start = 2027;
  const end = 2021;
  const years = [];
  for (let y = start; y >= end; y -= 1) years.push(String(y));
  return years;
})();

// Popular makes (name + CDN logo slug). Sorted alphabetically; "Other" pinned last.
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
  { name: 'Rivian', slug: 'rivian' },
  { name: 'Lucid', slug: 'lucid' },
  { name: 'Polestar', slug: 'polestar' },
  { name: 'Jaguar', slug: 'jaguar' },
  { name: 'Alfa Romeo', slug: 'alfa-romeo' },
  { name: 'Maserati', slug: 'maserati' },
  { name: 'Bentley', slug: 'bentley' },
  { name: 'Rolls-Royce', slug: 'rolls-royce' },
  { name: 'Aston Martin', slug: 'aston-martin' },
  { name: 'Ferrari', slug: 'ferrari' },
  { name: 'Lamborghini', slug: 'lamborghini' },
  { name: 'McLaren', slug: 'mclaren' },
]
  .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  // "Other" is always pinned to the end so it never sorts into the brand list.
  .concat([{ name: 'Other', slug: null }]);

// Current-lineup models per make (2021+). "Other / Not listed" is appended automatically.
export const CAR_MODELS = {
  Toyota: [
    'Camry', 'Corolla', 'Corolla Cross', 'Corolla Hatchback', 'Crown', 'Crown Signia', 'Avalon',
    'Prius', 'Prius Prime', 'Mirai', 'GR86', 'GR Corolla', 'GR Supra', 'RAV4', 'RAV4 Prime',
    'Venza', 'bZ4X', 'C-HR', 'Highlander', 'Grand Highlander', '4Runner', 'Sequoia',
    'Land Cruiser', 'Sienna', 'Tacoma', 'Tundra',
  ],
  Ford: [
    'F-150', 'F-150 Lightning', 'F-250 Super Duty', 'F-350 Super Duty', 'Ranger', 'Maverick',
    'Bronco', 'Bronco Sport', 'Escape', 'Edge', 'Explorer', 'Expedition', 'Mustang',
    'Mustang Mach-E', 'Transit', 'E-Transit',
  ],
  Chevrolet: [
    'Silverado 1500', 'Silverado HD', 'Silverado EV', 'Colorado', 'Trax', 'Trailblazer',
    'Equinox', 'Equinox EV', 'Blazer', 'Blazer EV', 'Traverse', 'Tahoe', 'Suburban',
    'Malibu', 'Camaro', 'Corvette', 'Bolt EV', 'Bolt EUV',
  ],
  Honda: [
    'Accord', 'Civic', 'Civic Hatchback', 'Civic Type R', 'Insight', 'CR-V', 'HR-V',
    'Pilot', 'Passport', 'Ridgeline', 'Odyssey', 'Prologue',
  ],
  Nissan: [
    'Versa', 'Sentra', 'Altima', 'Maxima', 'Kicks', 'Rogue', 'Rogue Sport', 'Murano',
    'Pathfinder', 'Armada', 'Frontier', 'Titan', 'Z', 'GT-R', 'Ariya', 'Leaf',
  ],
  Jeep: [
    'Wrangler', 'Wrangler 4xe', 'Gladiator', 'Grand Cherokee', 'Grand Cherokee L',
    'Grand Cherokee 4xe', 'Cherokee', 'Compass', 'Renegade', 'Wagoneer', 'Grand Wagoneer',
    'Wagoneer S', 'Recon',
  ],
  Ram: ['1500', '1500 Classic', '1500 REV', '2500', '3500', 'ProMaster', 'ProMaster City'],
  GMC: [
    'Sierra 1500', 'Sierra HD', 'Sierra EV', 'Canyon', 'Terrain', 'Acadia', 'Yukon',
    'Yukon XL', 'Hummer EV Pickup', 'Hummer EV SUV',
  ],
  Dodge: ['Charger', 'Charger Daytona', 'Challenger', 'Durango', 'Hornet'],
  Hyundai: [
    'Accent', 'Elantra', 'Elantra N', 'Sonata', 'Venue', 'Kona', 'Kona Electric', 'Tucson',
    'Santa Fe', 'Santa Cruz', 'Palisade', 'Ioniq 5', 'Ioniq 5 N', 'Ioniq 6', 'Ioniq 9', 'Nexo',
  ],
  Kia: [
    'Rio', 'Forte', 'K4', 'K5', 'Stinger', 'Soul', 'Seltos', 'Sportage', 'Sorento', 'Telluride',
    'Carnival', 'Niro', 'Niro EV', 'EV6', 'EV9',
  ],
  Subaru: ['Impreza', 'Legacy', 'WRX', 'BRZ', 'Crosstrek', 'Forester', 'Outback', 'Ascent', 'Solterra'],
  Volkswagen: [
    'Jetta', 'Jetta GLI', 'Golf GTI', 'Golf R', 'Passat', 'Arteon', 'Taos', 'Tiguan',
    'Atlas', 'Atlas Cross Sport', 'ID.4', 'ID. Buzz',
  ],
  Mazda: ['Mazda3', 'CX-30', 'CX-5', 'CX-50', 'CX-70', 'CX-90', 'CX-9', 'MX-5 Miata', 'MX-30'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
  BMW: [
    '2 Series', '3 Series', '4 Series', '5 Series', '7 Series', '8 Series', 'X1', 'X2', 'X3',
    'X4', 'X5', 'X6', 'X7', 'XM', 'Z4', 'i4', 'i5', 'i7', 'iX', 'M2', 'M3', 'M4', 'M5', 'M8',
  ],
  'Mercedes-Benz': [
    'A-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'CLE', 'CLS', 'GLA', 'GLB', 'GLC',
    'GLE', 'GLS', 'G-Class', 'SL', 'AMG GT', 'EQB', 'EQE Sedan', 'EQE SUV', 'EQS Sedan',
    'EQS SUV', 'Maybach S-Class', 'Maybach GLS', 'Sprinter', 'Metris',
  ],
  Lexus: ['IS', 'ES', 'LS', 'UX', 'NX', 'RX', 'GX', 'LX', 'TX', 'RZ', 'RC', 'LC'],
  Audi: [
    'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'Q8 e-tron',
    'e-tron GT', 'S3', 'S4', 'S5', 'S6', 'RS5', 'RS6', 'RS7', 'R8', 'TT',
  ],
  Acura: ['ILX', 'TLX', 'Integra', 'RDX', 'MDX', 'ZDX'],
  Cadillac: ['CT4', 'CT5', 'XT4', 'XT5', 'XT6', 'Escalade', 'Escalade IQ', 'Lyriq', 'Vistiq', 'Celestiq', 'Optiq'],
  Chrysler: ['300', 'Pacifica', 'Voyager'],
  Buick: ['Encore', 'Encore GX', 'Envista', 'Envision', 'Enclave'],
  Lincoln: ['Corsair', 'Nautilus', 'Aviator', 'Navigator'],
  Volvo: ['S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90', 'C40 Recharge', 'EX30', 'EX90'],
  'Land Rover': [
    'Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque',
    'Discovery', 'Discovery Sport', 'Defender',
  ],
  Porsche: ['911', '718 Cayman', '718 Boxster', 'Panamera', 'Macan', 'Macan EV', 'Cayenne', 'Taycan'],
  Mitsubishi: ['Mirage', 'Mirage G4', 'Outlander', 'Outlander PHEV', 'Outlander Sport', 'Eclipse Cross'],
  Infiniti: ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
  MINI: ['Cooper Hardtop', 'Cooper Convertible', 'Clubman', 'Countryman', 'Cooper SE (Electric)'],
  Genesis: ['G70', 'G80', 'Electrified G80', 'G90', 'GV60', 'GV70', 'Electrified GV70', 'GV80'],
  Fiat: ['500X', '500e'],
  Rivian: ['R1T', 'R1S', 'R2', 'R3', 'R3X', 'EDV'],
  Lucid: ['Air', 'Gravity'],
  Polestar: ['Polestar 2', 'Polestar 3', 'Polestar 4'],
  Jaguar: ['F-PACE', 'E-PACE', 'I-PACE', 'XF', 'F-TYPE'],
  'Alfa Romeo': ['Giulia', 'Stelvio', 'Tonale'],
  Maserati: ['Ghibli', 'Quattroporte', 'Levante', 'Grecale', 'MC20', 'GranTurismo'],
  Bentley: ['Bentayga', 'Continental GT', 'Flying Spur'],
  'Rolls-Royce': ['Ghost', 'Phantom', 'Cullinan', 'Spectre', 'Wraith', 'Dawn'],
  'Aston Martin': ['Vantage', 'DB11', 'DB12', 'DBS', 'DBX'],
  Ferrari: ['Roma', 'Portofino M', '296 GTB', 'SF90 Stradale', 'F8 Tributo', '812', 'Purosangue'],
  Lamborghini: ['Huracán', 'Urus', 'Revuelto', 'Aventador'],
  McLaren: ['Artura', 'GT', '720S', '750S', '765LT'],
  // "Other" make — RV and similar non-listed vehicle types.
  Other: ['RV', 'Motorhome', 'Camper Van'],
};

export function getModels(makeName) {
  const list = CAR_MODELS[makeName] ? [...CAR_MODELS[makeName]] : [];
  list.push('Other / Not listed');
  return list;
}
