// ─── LAB CONFIGURATION ────────────────────────────────────────────────────────
// Single source of truth. Mirrors LAB_PANELS in the frontend.
// Used by orders, acceptance, results routes for validation.

const LAB_CONFIG = {
  fish: {
    label: 'FISH',
    panels: [
      'ALL', 'MDS', 'MDS-Extended', 'Acute Leuk-NOS',
      'CML/MPN', 'JMML', 'CLL', 'CLL+CCND1',
      'Lymphoma-not CLL', 'HES', 'T-PLL', 'MM', 'Other'
    ]
  },
  fcm: {
    label: 'FCM',
    panels: [
      'Acute Leuk', 'CLPD', 'MM-Diagnosis', 'MM-MRD',
      'B-ALL-MRD', 'T-ALL-MRD', 'MDS', 'B & T Tubes Acute Leuk',
      'CLPD-MRD', 'Mast Cell Tube', 'Neuroblastoma', 'Other'
    ]
  },
  rtpcr: {
    label: 'RT-PCR',
    panels: [
      'Acute Leukemia Panel', 'BCR-ABL1', 'JAK2',
      'CML/MPN Panel', 'MYD88', 'BRAF',
      'ddPCR-MRD', 'qPCR-MRD', 'Other'
    ]
  },
  ngsh12: {
    label: 'NGS-H12',
    panels: [
      'Myeloid Mutation Panel', 'Lymphoid Mutation Panel',
      'TP53 Only', 'Other'
    ]
  },
  ngsh9: {
    label: 'NGS-H9',
    panels: [
      'RNA Fusion Panel', 'IBMFS Panel', 'WES with CNV',
      'TCR by NGS', 'T-ALL Somatic', 'Other'
    ]
  },
  tcr: {
    label: 'TCR',
    panels: ['TCR Beta', 'TCR Gamma', 'Other']
  }
};

const VALID_LABS    = Object.keys(LAB_CONFIG);
const VALID_PAYMENT = [
  '✅ Paid', 'Ayushman', 'Poor Free', 'JSSK',
  'HIMCARE', '❌ Not Paid', 'PP', 'HP', 'OK'
];

module.exports = { LAB_CONFIG, VALID_LABS, VALID_PAYMENT };
