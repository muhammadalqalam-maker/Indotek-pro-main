import assert from 'node:assert/strict';
import { generateProjectSCurve, calculateBOQActualProgress } from '../src/utils/scurve';
import { BOQItem } from '../src/types/rab';
import { WBSItem } from '../src/types';

console.log('🧪 Running S-Curve BOQ & WBS Integration Tests...\n');

// Mock BOQ Items
const sampleBOQItems: BOQItem[] = [
  {
    id: 'boq-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    kode: 'DIV-1.1',
    uraian: 'Pembersihan Lahan & Bowplank',
    satuan: 'm2',
    divisionCategory: 'Pekerjaan Persiapan',
    volume: 100,
    hargaSatuan: 50000,
    jumlahHarga: 5000000,
    bobotPersen: 10.0,
    progresPersen: 100.0, // 10% * 100% = 10.0% contribution
    urutan: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'boq-2',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    kode: 'DIV-2.1',
    uraian: 'Galian Tanah & Pondasi',
    satuan: 'm3',
    divisionCategory: 'Pekerjaan Struktur',
    volume: 50,
    hargaSatuan: 200000,
    jumlahHarga: 10000000,
    bobotPersen: 20.0,
    progresPersen: 50.0, // 20% * 50% = 10.0% contribution
    urutan: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'boq-3',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    kode: 'DIV-2.2',
    uraian: 'Beton Bertulang Kolom & Balok',
    satuan: 'm3',
    divisionCategory: 'Pekerjaan Struktur',
    volume: 40,
    hargaSatuan: 1000000,
    jumlahHarga: 40000000,
    bobotPersen: 40.0,
    progresPersen: 0.0, // 40% * 0% = 0.0% contribution
    urutan: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'boq-4',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    kode: 'DIV-3.1',
    uraian: 'Pasangan Dinding Bata & Plesteran',
    satuan: 'm2',
    divisionCategory: 'Pekerjaan Arsitektur',
    volume: 200,
    hargaSatuan: 100000,
    jumlahHarga: 20000000,
    bobotPersen: 20.0,
    progresPersen: 0.0, // 20% * 0% = 0%
    urutan: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'boq-5',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    kode: 'DIV-4.1',
    uraian: 'Instalasi Listrik & Sanitasi',
    satuan: 'titik',
    divisionCategory: 'Pekerjaan MEP',
    volume: 20,
    hargaSatuan: 500000,
    jumlahHarga: 10000000,
    bobotPersen: 10.0,
    progresPersen: 0.0, // 10% * 0% = 0%
    urutan: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Mock WBS Items
const sampleWBSItems: WBSItem[] = [
  {
    id: 'wbs-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    code: 'WBS-1',
    name: 'Pekerjaan Persiapan',
    category: 'Persiapan',
    durationDays: 30,
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    plannedProgress: 100,
    actualProgress: 100,
    status: 'Selesai',
    criticalPath: true,
    assignedTeam: 'Tim Sipil',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'wbs-2',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    code: 'WBS-2',
    name: 'Pekerjaan Struktur',
    category: 'Struktur',
    durationDays: 90,
    startDate: '2026-07-01',
    endDate: '2026-09-30',
    plannedProgress: 50,
    actualProgress: 25,
    status: 'Berjalan',
    criticalPath: true,
    assignedTeam: 'Tim Struktur',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Test 1: calculateBOQActualProgress
{
  const emptyProgress = calculateBOQActualProgress([]);
  assert.equal(emptyProgress, 0, 'Empty BOQ should yield 0% progress');

  // Total should be: 10%*100% + 20%*50% + 0 + 0 + 0 = 10 + 10 = 20%
  const actualProgress = calculateBOQActualProgress(sampleBOQItems);
  assert.equal(actualProgress, 20.0, `Expected 20.0% but got ${actualProgress}%`);
  console.log('✅ Test 1: calculateBOQActualProgress correctly computes 20.0% weighted progress');
}

// Test 2: generateProjectSCurve without BOQ/WBS fallback to sigmoid
{
  const curveSigmoid = generateProjectSCurve({
    projectId: 'p-1',
    projectName: 'Proyek Normal',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    currentActualProgress: 35.5,
    reportingDate: '2026-03-15',
  });

  assert.ok(curveSigmoid.points.length >= 6, 'Should generate monthly time series points');
  assert.equal(curveSigmoid.currentActual, 35.5, 'Actual progress should match raw param');
  assert.ok(curveSigmoid.points[0].plannedCumulative >= 0, 'First planned point should be >= 0');
  console.log('✅ Test 2: generateProjectSCurve backward-compatibility works with standard sigmoid');
}

// Test 3: generateProjectSCurve with BOQ and WBS integration
{
  const curveIntegrated = generateProjectSCurve({
    projectId: 'proj-1',
    projectName: 'Pembangunan Ruko 3 Lantai',
    startDate: '2026-06-01',
    endDate: '2026-11-30',
    reportingDate: '2026-07-15',
    boqItems: sampleBOQItems,
    wbsItems: sampleWBSItems,
  });

  // Current actual must be mathematically derived from BOQ items (20.0%)
  assert.equal(
    curveIntegrated.currentActual,
    20.0,
    `Current actual progress must be derived from BOQ items (expected 20.0%, got ${curveIntegrated.currentActual}%)`
  );

  // Planned cumulative must be populated across points
  assert.ok(curveIntegrated.points.length >= 6, 'Must generate points for project duration');
  const lastPoint = curveIntegrated.points[curveIntegrated.points.length - 1];
  assert.ok(lastPoint.plannedCumulative > 0, 'Final point planned progress must be > 0');

  // Verify health and deviation metrics
  assert.ok(typeof curveIntegrated.deviation === 'number', 'Deviation must be calculated');
  assert.ok(typeof curveIntegrated.spi === 'number', 'SPI must be calculated');
  assert.ok(['Tepat Waktu', 'Kritis', 'Terlambat'].includes(curveIntegrated.health), 'Health status must be valid');

  console.log(`✅ Test 3: S-Curve engineering integration passed:
     - Project: ${curveIntegrated.projectName}
     - Calculated Actual: ${curveIntegrated.currentActual}%
     - Planned at Cutoff: ${curveIntegrated.currentPlanned}%
     - Deviation: ${curveIntegrated.deviation}%
     - SPI: ${curveIntegrated.spi}
     - Health Status: ${curveIntegrated.health}`);
}

console.log('\n🎉 ALL S-CURVE BOQ & WBS INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
