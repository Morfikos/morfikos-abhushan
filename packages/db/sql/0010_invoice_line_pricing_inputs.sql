-- Spec 08: persist draft line pricing inputs for making/wastage/stones/discounts.
-- Defaults match MVP POS: fixed ₹0 making, wastage none, no stones, no discounts.
-- Browser anon/authenticated stay without grants.

ALTER TABLE app.invoice_lines
  ADD COLUMN IF NOT EXISTS pricing_input jsonb NOT NULL DEFAULT '{
    "making_charge": {"method": "fixed", "amount_inr": "0.00"},
    "wastage": {"method": "none"},
    "stone_charges": [],
    "line_discount": null
  }'::jsonb;

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS invoice_discount_input jsonb;

COMMENT ON COLUMN app.invoice_lines.pricing_input IS
  'Owner-approved invoice.v1 quote inputs for this line (making/wastage/stones/line discount).';

COMMENT ON COLUMN app.invoices.invoice_discount_input IS
  'Optional whole-invoice discount input (amount or percent); null means none.';
