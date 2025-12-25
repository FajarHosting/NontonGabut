export default async function handler(req, res) {
  return res.json({
    ok: true,
    dana: process.env.PAY_DANA_NUMBER || "",
    seabank: process.env.PAY_SEABANK_NUMBER || "",
    qrisImage: process.env.PAY_QRIS_IMAGE_URL || ""
  });
}