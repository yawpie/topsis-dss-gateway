import { describe, it, expect } from "vitest";

/**
 * Test suite untuk endpoint TOPSIS.
 *
 * Catatan: Test ini menggunakan API server yang sedang berjalan (integration test).
 * Pastikan backend sudah running di `http://localhost:3001` sebelum menjalankan test.
 * Jalankan: npm run test
 *
 * Untuk menjalankan test secara watch mode:
 * npm run test:watch
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";

// Helper to get auth token (login first)
async function getAuthToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "admin",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

// Helper to make authenticated requests
async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAuthToken();
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: `access_token=${token}`,
      ...options.headers,
    },
  });
}

describe("POST /item", () => {
  it("should reject request without nama", async () => {
    const res = await authFetch("/item", {
      method: "POST",
      body: JSON.stringify({
        kriteria: { ipk: 3.5 },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("should reject request without kriteria", async () => {
    const res = await authFetch("/item", {
      method: "POST",
      body: JSON.stringify({
        nama: "Test Mahasiswa",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("should reject request with non-numeric kriteria values", async () => {
    const res = await authFetch("/item", {
      method: "POST",
      body: JSON.stringify({
        nama: "Test Mahasiswa",
        kriteria: { ipk: "not_a_number" },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("should add a single item successfully", async () => {
    const res = await authFetch("/item", {
      method: "POST",
      body: JSON.stringify({
        nama: "test_vitest_001",
        kode_alternatif: "test_vitest_001",
        metadata: "test metadata",
        kriteria: {
          ipk: 3.5,
          semester: 6,
          penghasilan_ortu: 5000000,
          jumlah_tanggungan: 2,
          keaktifan_organisasi: 70,
          skor_prestasi: 50,
        },
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.message).toBe("Item berhasil ditambahkan");
    expect(data.data).toBeDefined();
    expect(data.data.kode_alternatif).toBe("test_vitest_001");
  });

  it("should upsert an existing item", async () => {
    // First insert
    await authFetch("/item", {
      method: "POST",
      body: JSON.stringify({
        nama: "test_vitest_upsert",
        kode_alternatif: "test_vitest_upsert",
        kriteria: { ipk: 3.0 },
      }),
    });

    // Update via upsert
    const res = await authFetch("/item", {
      method: "POST",
      body: JSON.stringify({
        nama: "test_vitest_upsert_updated",
        kode_alternatif: "test_vitest_upsert",
        metadata: "updated metadata",
        kriteria: { ipk: 3.8 },
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.data.nama_alternatif).toBe("test_vitest_upsert_updated");
  });
});

describe("POST /calculate", () => {
  it("should calculate TOPSIS without writing to DB", async () => {
    // Ensure there's at least one item
    await authFetch("/item", {
      method: "POST",
      body: JSON.stringify({
        nama: "test_calc_001",
        kode_alternatif: "test_calc_001",
        kriteria: {
          ipk: 3.5,
          semester: 4,
          penghasilan_ortu: 2000000,
          jumlah_tanggungan: 3,
          keaktifan_organisasi: 80,
          skor_prestasi: 60,
        },
      }),
    });

    const res = await authFetch("/calculate?write=false", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Each result should have TOPSIS fields
    const first = body.data[0];
    expect(first).toHaveProperty("nama");
    expect(first).toHaveProperty("nilai_preferensi");
    expect(first).toHaveProperty("jarak_ideal_positif");
    expect(first).toHaveProperty("jarak_ideal_negatif");
    expect(first).toHaveProperty("ranking");
    expect(first).toHaveProperty("kriteria");
  });
});

describe("GET /data", () => {
  it("should return paginated data", async () => {
    const res = await fetch(`${BASE_URL}/data?page=1&pageSize=5`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("totalRecords");
    expect(body).toHaveProperty("totalPages");
  });
});
