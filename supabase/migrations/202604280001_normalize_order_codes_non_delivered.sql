-- Normalize legacy order codes to a readable format for manual entry.
-- Scope: non-delivered orders only.
-- New format: 3 letters + 4 chars from [A-Z2-9] without ambiguous chars.
-- Example: CAB7K4M

DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  tries INT;
  letters TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  FOR r IN
    SELECT id
    FROM orders
    WHERE status IS DISTINCT FROM 'delivered'
      AND (
        order_code IS NULL
        OR order_code !~ '^[A-HJ-NP-Z]{3}[A-HJ-NP-Z2-9]{4}$'
      )
  LOOP
    tries := 0;
    LOOP
      tries := tries + 1;
      IF tries > 200 THEN
        RAISE EXCEPTION 'Unable to generate unique readable order_code for order id=%', r.id;
      END IF;

      candidate :=
        substr(letters, floor(random() * length(letters) + 1)::int, 1) ||
        substr(letters, floor(random() * length(letters) + 1)::int, 1) ||
        substr(letters, floor(random() * length(letters) + 1)::int, 1) ||
        substr(chars, floor(random() * length(chars) + 1)::int, 1) ||
        substr(chars, floor(random() * length(chars) + 1)::int, 1) ||
        substr(chars, floor(random() * length(chars) + 1)::int, 1) ||
        substr(chars, floor(random() * length(chars) + 1)::int, 1);

      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.order_code = candidate
      );
    END LOOP;

    UPDATE orders
    SET order_code = candidate
    WHERE id = r.id;
  END LOOP;
END $$;

