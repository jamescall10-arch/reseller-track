export const EBAY_CATEGORIES = [
  { group:'CCG & Trading Cards (Collectables)', items:[
    { id:'183454', name:'CCG Individual Cards (Pokémon, Yu-Gi-Oh, MTG etc.) ← use this' },
    { id:'183456', name:'CCG Sealed Packs' },
    { id:'183457', name:'CCG Sealed Boxes' },
    { id:'183458', name:'CCG Sealed Decks & Kits' },
    { id:'183459', name:'CCG Mixed Card Lots' },
    { id:'183460', name:'CCG Sets' },
    { id:'183462', name:'CCG Supplies & Accessories' },
    { id:'214',    name:'Sports Trading Cards (Football, Cricket etc.)' },
    { id:'212',    name:'Non-Sport Trading Cards' },
    { id:'261328', name:'Pokémon Individual Cards (graded/PSA only — requires Grade fields)' },
    { id:'261329', name:'Pokémon Sealed Products/Packs' },
  ]},
  { group:'Video Games', items:[
    { id:'146944', name:'PlayStation 5 Games' },
    { id:'139971', name:'PlayStation 4 Games' },
    { id:'180169', name:'Nintendo Switch Games' },
    { id:'195580', name:'Xbox Series X/S Games' },
    { id:'171834', name:'Xbox One Games' },
    { id:'49230',  name:'Nintendo DS/2DS/3DS Games' },
    { id:'139972', name:'PlayStation 3 Games' },
    { id:'1249',   name:'Video Games (General)' },
    { id:'139973', name:'PlayStation Consoles' },
    { id:'180156', name:'Nintendo Switch Consoles' },
    { id:'176972', name:'Xbox Consoles' },
  ]},
  { group:'Clothing & Shoes', items:[
    { id:'1059',   name:'Men\'s Clothing (General)' },
    { id:'15724',  name:'Women\'s Clothing (General)' },
    { id:'95672',  name:'Men\'s Trainers/Sneakers' },
    { id:'95673',  name:'Women\'s Trainers/Sneakers' },
    { id:'53557',  name:'Men\'s T-Shirts' },
    { id:'15689',  name:'Men\'s Jeans' },
    { id:'53159',  name:'Women\'s Dresses' },
    { id:'57988',  name:'Boys\' Clothing (2-16 Years)' },
    { id:'57989',  name:'Girls\' Clothing (2-16 Years)' },
    { id:'3051',   name:'Baby Clothing (0-24 Months)' },
    { id:'2229',   name:'Men\'s Jackets & Coats' },
  ]},
  { group:'Electronics', items:[
    { id:'9355',   name:'Mobile & Smart Phones' },
    { id:'175672', name:'Laptops & Netbooks' },
    { id:'171957', name:'iPads, Tablets & eReaders' },
    { id:'2169',   name:'Headphones' },
    { id:'3676',   name:'Cameras & Photography' },
    { id:'14969',  name:'Smart Watches' },
    { id:'183062', name:'Computer Components' },
    { id:'31388',  name:'Portable Audio (MP3 Players)' },
    { id:'293',    name:'Consumer Electronics (General)' },
    { id:'78978',  name:'TV & Home Audio' },
  ]},
  { group:'Books, CDs & DVDs', items:[
    { id:'267', name:'Books' },
    { id:'306', name:'Music CDs' },
    { id:'617', name:'DVDs & Blu-ray' },
    { id:'11450', name:'Vinyl Records' },
    { id:'76', name:'Video VHS Tapes' },
  ]},
  { group:'Toys & Games', items:[
    { id:'220',    name:'Toys & Games (General)' },
    { id:'183423', name:'LEGO Sets & Packs' },
    { id:'153562', name:'LEGO Individual Pieces' },
    { id:'2595',   name:'Action Figures' },
    { id:'19016',  name:'Board Games' },
    { id:'1197',   name:'Diecast & Vehicles' },
    { id:'15649',  name:'Dolls & Bears' },
    { id:'717',    name:'Remote Control Models' },
  ]},
  { group:'Sports & Fitness', items:[
    { id:'888',    name:'Sporting Goods (General)' },
    { id:'2639',   name:'Football Equipment' },
    { id:'2550',   name:'Cycling' },
    { id:'180062', name:'Gym & Training Equipment' },
    { id:'159043', name:'Golf Equipment' },
    { id:'64482',  name:'Tennis Equipment' },
    { id:'159233', name:'Fishing Tackle' },
  ]},
  { group:'Collectibles & Art', items:[
    { id:'99',  name:'Coins' },
    { id:'237', name:'Stamps' },
    { id:'870', name:'Comics' },
    { id:'564', name:'Paintings' },
    { id:'1',   name:'Collectibles (General)' },
    { id:'13576', name:'Autographs' },
    { id:'181039', name:'Funko Pop Figures' },
  ]},
  { group:'Home & Garden', items:[
    { id:'10032', name:'Home, Furniture & DIY' },
    { id:'9473',  name:'Garden & Patio' },
    { id:'1526',  name:'Kitchen & Dining' },
    { id:'116034', name:'Bedding & Towels' },
    { id:'1249',  name:'Lighting' },
    { id:'20710', name:'Tools' },
  ]},
  { group:'Jewellery & Watches', items:[
    { id:'281', name:'Jewellery' },
    { id:'14324', name:'Watches' },
    { id:'50529', name:'Fashion Jewellery' },
  ]},
  { group:'Health & Beauty', items:[
    { id:'26395', name:'Health & Beauty (General)' },
    { id:'180345', name:'Makeup & Cosmetics' },
    { id:'11838', name:'Skincare' },
    { id:'36446', name:'Fragrances/Perfume' },
    { id:'32110', name:'Supplements' },
  ]},
  { group:'Vehicles & Parts', items:[
    { id:'9800',  name:'Car Parts' },
    { id:'179753', name:'Motorcycle Parts' },
  ]},
  { group:'Other', items:[
    { id:'1281', name:'Everything Else' },
  ]},
];

export const EBAY_CONDITIONS = [
  { group:'General eBay', items:[
    'New',
    'Used — Like New',
    'Used — Very Good',
    'Used — Good',
    'Used — Acceptable',
    'For parts or not working',
    'Seller refurbished',
    'Open box',
  ]},
  { group:'Trading Cards (TCG)', items:[
    'Near Mint or Better (NM/M)',
    'Lightly Played (LP)',
    'Moderately Played (MP)',
    'Heavily Played (HP)',
    'Damaged (D)',
  ]},
];

// ── eBay condition ID mapping ─────────────────────────────────────────────────
export const CONDITION_IDS = {
  'New':                           1000,
  'Open box':                      1500,
  'Seller refurbished':            2500,
  'Used — Like New':               2750,
  'Near Mint or Better (NM/M)':    2750,
  'Used — Very Good':              3000,
  'Lightly Played (LP)':           3000,
  'Used — Good':                   4000,
  'Moderately Played (MP)':        4000,
  'Used — Acceptable':             5000,
  'Heavily Played (HP)':           5000,
  'Damaged (D)':                   6000,
  'For parts or not working':      7000,
};

export const getConditionId = (condition) =>
  CONDITION_IDS[condition] ?? 3000; // default: Used - Very Good

// ── Shipping service options ───────────────────────────────────────────────────
export const SHIPPING_SERVICES = [
  { id:'UK_RoyalMailSecondClassStandard',  label:'Royal Mail 2nd Class',           default:true  },
  { id:'UK_RoyalMailFirstClassStandard',   label:'Royal Mail 1st Class',           default:false },
  { id:'UK_RoyalMailTracked48',            label:'Royal Mail Tracked 48',          default:false },
  { id:'UK_RoyalMailTracked24',            label:'Royal Mail Tracked 24',          default:false },
  { id:'UK_RoyalMailSecondClassRecorded',  label:'Royal Mail Signed For 2nd Class',default:false },
  { id:'UK_RoyalMailFirstClassRecorded',   label:'Royal Mail Signed For 1st Class',default:false },
  { id:'UK_CollectInPerson',               label:'Collect in Person',              default:false },
];

// ── Trading card category IDs ─────────────────────────────────────────────────
export const TCG_CATEGORY_IDS = new Set([
  '183454','183456','183457','183458','183459','183460',
  '261328','261329','212',
]);

// Category-aware condition ID lookup
// TCG categories don't support condition 3000 on eBay UK
export function getConditionIdForCategory(condition, categoryId) {
  const isTCG = TCG_CATEGORY_IDS.has(String(categoryId || ''));

  const TCG_MAP = {
    'New':                           1000,
    'Near Mint or Better (NM/M)':    2750,
    'Lightly Played (LP)':           2750,
    'Used — Like New':               2750,
    'Moderately Played (MP)':        4000,
    'Used — Very Good':              4000,
    'Used — Good':                   4000,
    'Heavily Played (HP)':           5000,
    'Used — Acceptable':             5000,
    'Damaged (D)':                   7000,
    'For parts or not working':      7000,
    'Seller refurbished':            2500,
    'Open box':                      1500,
  };

  const STD_MAP = { ...CONDITION_IDS };

  const map = isTCG ? TCG_MAP : STD_MAP;
  return map[condition] ?? (isTCG ? 2750 : 3000);
}

// Default item specifics per category group
// These are the grade-required categories (professionally graded cards section)
const GRADED_CARD_CATEGORIES = new Set(['261328']);

export function getDefaultItemSpecifics(categoryId) {
  const catStr = String(categoryId || '');
  if (GRADED_CARD_CATEGORIES.has(catStr)) {
    // Graded card categories require Grade and Professional Grader
    return [
      { name:'Sport',               value:'Non-Sport Trading Cards' },
      { name:'Grade',               value:'Ungraded' },
      { name:'Professional Grader', value:'Not Professionally Graded' },
    ];
  }
  if (TCG_CATEGORY_IDS.has(catStr)) {
    // Standard CCG category — Sport, Game, Grade, Professional Grader required by eBay UK
    return [
      { name:'Sport',               value:'Non-Sport Trading Cards' },
      { name:'Game',                value:'' },
      { name:'Grade',               value:'' },
      { name:'Professional Grader', value:'' },
    ];
  }
  return [];
}
