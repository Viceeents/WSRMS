CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (lower(email));

CREATE TABLE IF NOT EXISTS categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parcels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_code text NOT NULL UNIQUE,
    category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    company text NOT NULL,
    supplier text,
    storage_location text NOT NULL,
    fragile boolean NOT NULL DEFAULT false,
    quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    weight_kg numeric(10, 2) CHECK (weight_kg IS NULL OR weight_kg >= 0),
    reorder_threshold integer NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
    status text GENERATED ALWAYS AS (
        CASE
            WHEN quantity = 0 THEN 'out_of_stock'
            WHEN quantity <= reorder_threshold THEN 'low_stock'
            ELSE 'in_stock'
        END
    ) STORED,
    notes text,
    received_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parcels_company_idx ON parcels (company);
CREATE INDEX IF NOT EXISTS parcels_status_idx ON parcels (status);
CREATE INDEX IF NOT EXISTS parcels_location_idx ON parcels (storage_location);

CREATE TABLE IF NOT EXISTS transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_code text NOT NULL UNIQUE,
    parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
    type text NOT NULL CHECK (type IN ('check_in', 'dispatch')),
    quantity integer NOT NULL CHECK (quantity > 0),
    staff_id uuid REFERENCES users(id) ON DELETE SET NULL,
    recipient text,
    note text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CHECK (type <> 'dispatch' OR recipient IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS transactions_parcel_time_idx
    ON transactions (parcel_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_type_time_idx
    ON transactions (type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    old_data jsonb,
    new_data jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_record_time_idx
    ON audit_events (table_name, record_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION adjust_parcel_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    available_quantity integer;
BEGIN
    SELECT quantity
    INTO available_quantity
    FROM parcels
    WHERE id = NEW.parcel_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcel % does not exist', NEW.parcel_id;
    END IF;

    IF NEW.type = 'dispatch' AND NEW.quantity > available_quantity THEN
        RAISE EXCEPTION 'Cannot dispatch % units; only % are available',
            NEW.quantity, available_quantity;
    END IF;

    UPDATE parcels
    SET quantity = CASE
            WHEN NEW.type = 'check_in' THEN quantity + NEW.quantity
            ELSE quantity - NEW.quantity
        END,
        updated_at = now()
    WHERE id = NEW.parcel_id;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION write_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_setting text := NULLIF(current_setting('app.user_id', true), '');
BEGIN
    INSERT INTO audit_events (
        table_name,
        record_id,
        action,
        actor_id,
        old_data,
        new_data
    ) VALUES (
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE WHEN actor_setting IS NULL THEN NULL ELSE actor_setting::uuid END,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) - 'password_hash' END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) - 'password_hash' END
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Transactions are immutable; record a corrective transaction instead';
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS categories_set_updated_at ON categories;
CREATE TRIGGER categories_set_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS parcels_set_updated_at ON parcels;
CREATE TRIGGER parcels_set_updated_at
    BEFORE UPDATE ON parcels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS transactions_adjust_quantity ON transactions;
CREATE TRIGGER transactions_adjust_quantity
    BEFORE INSERT ON transactions
    FOR EACH ROW EXECUTE FUNCTION adjust_parcel_quantity();

DROP TRIGGER IF EXISTS transactions_immutable ON transactions;
CREATE TRIGGER transactions_immutable
    BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_transaction_mutation();

DROP TRIGGER IF EXISTS users_audit ON users;
CREATE TRIGGER users_audit
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION write_audit_event();

DROP TRIGGER IF EXISTS categories_audit ON categories;
CREATE TRIGGER categories_audit
    AFTER INSERT OR UPDATE OR DELETE ON categories
    FOR EACH ROW EXECUTE FUNCTION write_audit_event();

DROP TRIGGER IF EXISTS parcels_audit ON parcels;
CREATE TRIGGER parcels_audit
    AFTER INSERT OR UPDATE OR DELETE ON parcels
    FOR EACH ROW EXECUTE FUNCTION write_audit_event();

DROP TRIGGER IF EXISTS transactions_audit ON transactions;
CREATE TRIGGER transactions_audit
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION write_audit_event();