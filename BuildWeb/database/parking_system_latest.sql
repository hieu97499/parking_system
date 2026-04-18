\restrict BxkE3TZKHOKShbTCKahYnTUa35HtVX10g0VLhQxz4U4xBrO77HVkQ8hLW3qWbEu
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';
CREATE FUNCTION public.trigger_create_wallet_for_new_user() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN INSERT INTO wallets (user_id) VALUES (NEW.user_id); RETURN NEW; END;
$$;
ALTER FUNCTION public.trigger_create_wallet_for_new_user() OWNER TO postgres;
CREATE FUNCTION public.trigger_log_device_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO device_status_logs (device_id, status, message)
        VALUES (NEW.device_id, NEW.status,
                'Trạng thái thay đổi từ ' || COALESCE(OLD.status, 'unknown') || ' → ' || NEW.status);
    END IF;
    RETURN NEW;
END;
$$;
ALTER FUNCTION public.trigger_log_device_status_change() OWNER TO postgres;
CREATE FUNCTION public.trigger_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
ALTER FUNCTION public.trigger_set_updated_at() OWNER TO postgres;
CREATE FUNCTION public.update_face_images_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
ALTER FUNCTION public.update_face_images_updated_at() OWNER TO postgres;
SET default_tablespace = '';
SET default_table_access_method = heap;
CREATE TABLE public.admin_sessions (
    session_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    admin_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    ip_address inet,
    user_agent character varying(500),
    expires_at timestamp with time zone DEFAULT (now() + '08:00:00'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_sessions OWNER TO postgres;
CREATE TABLE public.admins (
    admin_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(100) NOT NULL,
    email character varying(100),
    role character varying(20) DEFAULT 'operator'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admins_role_check CHECK (((role)::text = ANY ((ARRAY['superadmin'::character varying, 'admin'::character varying, 'operator'::character varying])::text[])))
);
ALTER TABLE public.admins OWNER TO postgres;
CREATE TABLE public.authorizations (
    auth_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    vehicle_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    delegate_name character varying(100),
    delegate_face_image character varying(500) NOT NULL,
    delegate_embedding real[] NOT NULL,
    auth_type character varying(20) NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    is_consumed boolean DEFAULT false NOT NULL,
    consumed_at timestamp with time zone,
    model_version character varying(50) DEFAULT 'arcface-r100-v1'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT authorizations_auth_type_check CHECK (((auth_type)::text = ANY ((ARRAY['once'::character varying, 'daily'::character varying, 'permanent'::character varying])::text[])))
);
ALTER TABLE public.authorizations OWNER TO postgres;
CREATE TABLE public.daily_reports (
    report_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lot_id uuid NOT NULL,
    report_date date NOT NULL,
    total_sessions integer DEFAULT 0 NOT NULL,
    member_sessions integer DEFAULT 0 NOT NULL,
    guest_sessions_count integer DEFAULT 0 NOT NULL,
    total_revenue numeric(15,2) DEFAULT 0 NOT NULL,
    member_revenue numeric(15,2) DEFAULT 0 NOT NULL,
    guest_revenue numeric(15,2) DEFAULT 0 NOT NULL,
    auth_success_count integer DEFAULT 0 NOT NULL,
    auth_failed_count integer DEFAULT 0 NOT NULL,
    auth_fallback_guest_count integer DEFAULT 0 NOT NULL,
    avg_duration_minutes numeric(6,2) DEFAULT 0 NOT NULL,
    hourly_occupancy jsonb,
    peak_hour smallint,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_reports_peak_hour_check CHECK (((peak_hour >= 0) AND (peak_hour <= 23)))
);
ALTER TABLE public.daily_reports OWNER TO postgres;
CREATE TABLE public.device_status_logs (
    log_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    device_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    message text,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.device_status_logs OWNER TO postgres;
CREATE TABLE public.devices (
    device_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lot_id uuid NOT NULL,
    device_name character varying(100) NOT NULL,
    device_type character varying(30) NOT NULL,
    lane character varying(10),
    ip_address inet,
    serial_port character varying(30),
    baud_rate integer DEFAULT 9600,
    status character varying(20) DEFAULT 'offline'::character varying NOT NULL,
    last_heartbeat timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT devices_device_type_check CHECK (((device_type)::text = ANY ((ARRAY['camera_face'::character varying, 'camera_plate'::character varying, 'barrier'::character varying, 'sensor'::character varying, 'led'::character varying, 'speaker'::character varying, 'arduino'::character varying, 'computer'::character varying])::text[]))),
    CONSTRAINT devices_lane_check CHECK (((lane)::text = ANY ((ARRAY['entry'::character varying, 'exit'::character varying, 'both'::character varying])::text[]))),
    CONSTRAINT devices_status_check CHECK (((status)::text = ANY ((ARRAY['online'::character varying, 'offline'::character varying, 'error'::character varying, 'maintenance'::character varying])::text[])))
);
ALTER TABLE public.devices OWNER TO postgres;
CREATE TABLE public.event_logs (
    event_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lot_id uuid,
    event_type character varying(60) NOT NULL,
    session_id uuid,
    session_kind character varying(10),
    user_id uuid,
    admin_id uuid,
    device_id uuid,
    license_plate character varying(20),
    description text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_logs_session_kind_check CHECK (((session_kind)::text = ANY ((ARRAY['member'::character varying, 'guest'::character varying])::text[])))
);
ALTER TABLE public.event_logs OWNER TO postgres;
CREATE TABLE public.face_embeddings (
    embedding_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    embedding real[] NOT NULL,
    face_image_path character varying(500),
    model_version character varying(50) DEFAULT 'arcface-r100-v1'::character varying NOT NULL,
    is_primary boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.face_embeddings OWNER TO postgres;
CREATE TABLE public.fcm_tokens (
    token_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    device_type character varying(10),
    device_info character varying(200),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fcm_tokens_device_type_check CHECK (((device_type)::text = ANY ((ARRAY['android'::character varying, 'ios'::character varying, 'web'::character varying])::text[])))
);
ALTER TABLE public.fcm_tokens OWNER TO postgres;
CREATE TABLE public.guest_sessions (
    session_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    session_code character varying(20) NOT NULL,
    license_plate character varying(20),
    lot_id uuid NOT NULL,
    entry_time timestamp with time zone NOT NULL,
    exit_time timestamp with time zone,
    duration_minutes integer,
    entry_face_image_path character varying(500),
    entry_plate_image_path character varying(500),
    entry_composite_image_path character varying(500),
    exit_composite_image_path character varying(500),
    fee numeric(10,2),
    payment_gateway character varying(30),
    gateway_transaction_id character varying(200),
    payment_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    paid_at timestamp with time zone,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    abnormal_reason text,
    entry_device_id uuid,
    exit_device_id uuid,
    is_synced boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guest_sessions_duration_minutes_check CHECK ((duration_minutes >= 0)),
    CONSTRAINT guest_sessions_fee_check CHECK ((fee >= (0)::numeric)),
    CONSTRAINT guest_sessions_payment_gateway_check CHECK (((payment_gateway)::text = ANY ((ARRAY['vnpay'::character varying, 'momo'::character varying, 'zalopay'::character varying, 'cash_qr'::character varying])::text[]))),
    CONSTRAINT guest_sessions_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT guest_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'abnormal'::character varying])::text[])))
);
ALTER TABLE public.guest_sessions OWNER TO postgres;
CREATE TABLE public.manual_overrides (
    override_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lot_id uuid,
    admin_id uuid NOT NULL,
    device_id uuid,
    action character varying(50) NOT NULL,
    reason text NOT NULL,
    related_session_id uuid,
    related_license_plate character varying(20),
    ip_address inet,
    executed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT manual_overrides_action_check CHECK (((action)::text = ANY ((ARRAY['open_barrier'::character varying, 'close_barrier'::character varying, 'end_session'::character varying, 'unlock_account'::character varying, 'force_exit'::character varying])::text[])))
);
ALTER TABLE public.manual_overrides OWNER TO postgres;
CREATE TABLE public.monthly_passes (
    pass_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    lot_id uuid NOT NULL,
    license_plate character varying(20) NOT NULL,
    valid_from date NOT NULL,
    valid_until date NOT NULL,
    fee_paid numeric(10,2) NOT NULL,
    wallet_tx_id uuid,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_pass_dates CHECK ((valid_until >= valid_from)),
    CONSTRAINT monthly_passes_fee_paid_check CHECK ((fee_paid >= (0)::numeric)),
    CONSTRAINT monthly_passes_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);
ALTER TABLE public.monthly_passes OWNER TO postgres;
CREATE TABLE public.notifications (
    notification_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    data jsonb,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY ((ARRAY['vehicle_entry'::character varying, 'vehicle_exit'::character varying, 'fee_deducted'::character varying, 'topup_success'::character varying, 'low_balance'::character varying, 'withdraw_success'::character varying, 'session_abnormal'::character varying, 'auth_granted'::character varying, 'system'::character varying])::text[])))
);
ALTER TABLE public.notifications OWNER TO postgres;
CREATE TABLE public.parking_lots (
    lot_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(200) NOT NULL,
    address text,
    total_capacity integer NOT NULL,
    current_occupancy integer DEFAULT 0 NOT NULL,
    phone character varying(20),
    email character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_occupancy_not_exceed_capacity CHECK ((current_occupancy <= total_capacity)),
    CONSTRAINT parking_lots_current_occupancy_check CHECK ((current_occupancy >= 0)),
    CONSTRAINT parking_lots_total_capacity_check CHECK ((total_capacity > 0))
);
ALTER TABLE public.parking_lots OWNER TO postgres;
CREATE TABLE public.parking_sessions (
    session_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    vehicle_id uuid NOT NULL,
    user_id uuid NOT NULL,
    auth_id uuid,
    session_type character varying(20) DEFAULT 'member'::character varying NOT NULL,
    license_plate character varying(20) NOT NULL,
    lot_id uuid NOT NULL,
    entry_time timestamp with time zone NOT NULL,
    exit_time timestamp with time zone,
    duration_minutes integer,
    entry_face_image_path character varying(500),
    entry_plate_image_path character varying(500),
    entry_composite_image_path character varying(500),
    exit_face_image_path character varying(500),
    exit_plate_image_path character varying(500),
    exit_composite_image_path character varying(500),
    fee numeric(10,2),
    wallet_transaction_id uuid,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    abnormal_reason text,
    force_ended_by uuid,
    force_end_reason text,
    entry_device_id uuid,
    exit_device_id uuid,
    is_synced boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parking_sessions_duration_minutes_check CHECK ((duration_minutes >= 0)),
    CONSTRAINT parking_sessions_fee_check CHECK ((fee >= (0)::numeric)),
    CONSTRAINT parking_sessions_session_type_check CHECK (((session_type)::text = ANY ((ARRAY['member'::character varying, 'authorized'::character varying])::text[]))),
    CONSTRAINT parking_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'abnormal'::character varying, 'force_ended'::character varying])::text[])))
);
ALTER TABLE public.parking_sessions OWNER TO postgres;
CREATE TABLE public.pricing_configs (
    config_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lot_id uuid NOT NULL,
    time_slot_name character varying(50) NOT NULL,
    start_hour smallint NOT NULL,
    end_hour smallint NOT NULL,
    price_per_hour numeric(10,2) NOT NULL,
    minimum_fee numeric(10,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_configs_end_hour_check CHECK (((end_hour >= 0) AND (end_hour <= 23))),
    CONSTRAINT pricing_configs_price_per_hour_check CHECK ((price_per_hour >= (0)::numeric)),
    CONSTRAINT pricing_configs_start_hour_check CHECK (((start_hour >= 0) AND (start_hour <= 23)))
);
ALTER TABLE public.pricing_configs OWNER TO postgres;
CREATE TABLE public.refresh_tokens (
    token_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    device_info character varying(200),
    ip_address inet,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.refresh_tokens OWNER TO postgres;
CREATE TABLE public.report_exports (
    export_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    admin_id uuid NOT NULL,
    lot_id uuid,
    report_type character varying(30) NOT NULL,
    date_from date,
    date_to date,
    file_format character varying(10) NOT NULL,
    file_path character varying(500),
    file_size_bytes bigint,
    status character varying(20) DEFAULT 'processing'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT report_exports_file_format_check CHECK (((file_format)::text = ANY ((ARRAY['csv'::character varying, 'xlsx'::character varying, 'pdf'::character varying])::text[]))),
    CONSTRAINT report_exports_status_check CHECK (((status)::text = ANY ((ARRAY['processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);
ALTER TABLE public.report_exports OWNER TO postgres;
CREATE TABLE public.sync_queue (
    queue_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lot_id uuid,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    operation character varying(10) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone,
    CONSTRAINT sync_queue_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['parking_session'::character varying, 'guest_session'::character varying, 'wallet_transaction'::character varying, 'event_log'::character varying, 'device_status'::character varying, 'system_alert'::character varying])::text[]))),
    CONSTRAINT sync_queue_operation_check CHECK (((operation)::text = ANY ((ARRAY['insert'::character varying, 'update'::character varying, 'delete'::character varying])::text[]))),
    CONSTRAINT sync_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'syncing'::character varying, 'synced'::character varying, 'failed'::character varying])::text[])))
);
ALTER TABLE public.sync_queue OWNER TO postgres;
CREATE TABLE public.system_alerts (
    alert_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lot_id uuid,
    alert_type character varying(50) NOT NULL,
    severity character varying(10) DEFAULT 'warning'::character varying NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    related_device_id uuid,
    related_user_id uuid,
    related_session_id uuid,
    status character varying(20) DEFAULT 'unresolved'::character varying NOT NULL,
    is_resolved boolean GENERATED ALWAYS AS (((status)::text <> 'unresolved'::text)) STORED,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_alerts_alert_type_check CHECK (((alert_type)::text = ANY ((ARRAY['device_offline'::character varying, 'arduino_disconnected'::character varying, 'session_abnormal'::character varying, 'lot_full'::character varying, 'low_balance_user'::character varying, 'sync_failed'::character varying, 'auth_anomaly'::character varying, 'barrier_stuck'::character varying, 'camera_error'::character varying])::text[]))),
    CONSTRAINT system_alerts_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT system_alerts_status_check CHECK (((status)::text = ANY ((ARRAY['unresolved'::character varying, 'resolved'::character varying, 'ignored'::character varying])::text[])))
);
ALTER TABLE public.system_alerts OWNER TO postgres;
CREATE TABLE public.system_configs (
    config_key character varying(100) NOT NULL,
    config_value text NOT NULL,
    data_type character varying(20) DEFAULT 'string'::character varying NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_configs_data_type_check CHECK (((data_type)::text = ANY ((ARRAY['string'::character varying, 'integer'::character varying, 'decimal'::character varying, 'boolean'::character varying, 'json'::character varying])::text[])))
);
ALTER TABLE public.system_configs OWNER TO postgres;
CREATE TABLE public.user_face_images (
    image_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    image_path character varying(500) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    embedding_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_face_images_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'processed'::character varying, 'failed'::character varying])::text[])))
);
ALTER TABLE public.user_face_images OWNER TO postgres;
CREATE TABLE public.users (
    user_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    full_name character varying(100) NOT NULL,
    phone_number character varying(15) NOT NULL,
    email character varying(100),
    password_hash character varying(255) NOT NULL,
    avatar_path character varying(500),
    is_active boolean DEFAULT true NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.users OWNER TO postgres;
CREATE VIEW public.v_active_sessions AS
 SELECT parking_sessions.session_id,
    parking_sessions.lot_id,
    parking_sessions.license_plate,
    parking_sessions.session_type,
    parking_sessions.entry_time,
    (EXTRACT(epoch FROM (now() - parking_sessions.entry_time)) / (60)::numeric) AS duration_minutes_so_far,
    parking_sessions.user_id,
    'member'::text AS session_kind
   FROM public.parking_sessions
  WHERE ((parking_sessions.status)::text = 'active'::text)
UNION ALL
 SELECT guest_sessions.session_id,
    guest_sessions.lot_id,
    guest_sessions.license_plate,
    'guest'::character varying AS session_type,
    guest_sessions.entry_time,
    (EXTRACT(epoch FROM (now() - guest_sessions.entry_time)) / (60)::numeric) AS duration_minutes_so_far,
    NULL::uuid AS user_id,
    'guest'::text AS session_kind
   FROM public.guest_sessions
  WHERE ((guest_sessions.status)::text = 'active'::text);
ALTER VIEW public.v_active_sessions OWNER TO postgres;
CREATE VIEW public.v_device_status AS
 SELECT d.device_id,
    pl.name AS lot_name,
    d.device_name,
    d.device_type,
    d.lane,
    d.serial_port,
    d.ip_address,
    d.status,
    d.last_heartbeat,
    (EXTRACT(epoch FROM (now() - d.last_heartbeat)) / (60)::numeric) AS minutes_since_heartbeat
   FROM (public.devices d
     JOIN public.parking_lots pl ON ((pl.lot_id = d.lot_id)))
  ORDER BY d.lot_id, d.device_type;
ALTER VIEW public.v_device_status OWNER TO postgres;
CREATE VIEW public.v_lot_overview AS
 SELECT lot_id,
    name AS lot_name,
    total_capacity,
    current_occupancy,
    (total_capacity - current_occupancy) AS available_slots,
    round((((current_occupancy)::numeric * 100.0) / (NULLIF(total_capacity, 0))::numeric), 1) AS occupancy_percent,
    ( SELECT count(*) AS count
           FROM public.devices d
          WHERE ((d.lot_id = pl.lot_id) AND ((d.status)::text <> 'online'::text))) AS offline_device_count,
    ( SELECT count(*) AS count
           FROM public.system_alerts sa
          WHERE ((sa.lot_id = pl.lot_id) AND ((sa.status)::text = 'unresolved'::text))) AS open_alerts,
    is_active
   FROM public.parking_lots pl;
ALTER VIEW public.v_lot_overview OWNER TO postgres;
CREATE VIEW public.v_pending_face_images AS
 SELECT fi.image_id,
    fi.user_id,
    fi.image_path,
    fi.status,
    fi.created_at,
    u.full_name,
    u.phone_number
   FROM (public.user_face_images fi
     JOIN public.users u ON ((u.user_id = fi.user_id)))
  WHERE ((fi.status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying])::text[]))
  ORDER BY fi.created_at;
ALTER VIEW public.v_pending_face_images OWNER TO postgres;
CREATE VIEW public.v_user_face_summary AS
 SELECT u.user_id,
    u.full_name,
    u.phone_number,
    count(fi.image_id) AS total_images,
    count(fi.image_id) FILTER (WHERE ((fi.status)::text = 'pending'::text)) AS pending_count,
    count(fi.image_id) FILTER (WHERE ((fi.status)::text = 'processed'::text)) AS processed_count,
    count(fe.embedding_id) AS embedding_count,
    max(fi.created_at) AS last_upload_at
   FROM ((public.users u
     LEFT JOIN public.user_face_images fi ON ((fi.user_id = u.user_id)))
     LEFT JOIN public.face_embeddings fe ON (((fe.user_id = u.user_id) AND fe.is_active)))
  GROUP BY u.user_id, u.full_name, u.phone_number;
ALTER VIEW public.v_user_face_summary OWNER TO postgres;
CREATE TABLE public.vehicles (
    vehicle_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    license_plate character varying(20) NOT NULL,
    plate_image_path character varying(500),
    nickname character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.vehicles OWNER TO postgres;
CREATE TABLE public.wallet_transactions (
    transaction_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wallet_id uuid NOT NULL,
    user_id uuid NOT NULL,
    transaction_type character varying(20) NOT NULL,
    amount numeric(15,2) NOT NULL,
    balance_before numeric(15,2) NOT NULL,
    balance_after numeric(15,2) NOT NULL,
    payment_gateway character varying(30),
    gateway_transaction_id character varying(200),
    gateway_reference_code character varying(200),
    gateway_response_code character varying(20),
    parking_session_id uuid,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT wallet_transactions_payment_gateway_check CHECK (((payment_gateway)::text = ANY ((ARRAY['vnpay'::character varying, 'momo'::character varying, 'zalopay'::character varying, 'bank_transfer'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT wallet_transactions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'success'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT wallet_transactions_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['topup'::character varying, 'deduct'::character varying, 'withdraw'::character varying, 'refund'::character varying])::text[])))
);
ALTER TABLE public.wallet_transactions OWNER TO postgres;
CREATE TABLE public.wallets (
    wallet_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    low_balance_threshold numeric(15,2) DEFAULT 50000.00 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallets_balance_check CHECK ((balance >= (0)::numeric))
);
ALTER TABLE public.wallets OWNER TO postgres;
CREATE TABLE public.withdraw_requests (
    request_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(15,2) NOT NULL,
    bank_name character varying(100) NOT NULL,
    bank_account character varying(30) NOT NULL,
    account_name character varying(100) NOT NULL,
    wallet_tx_id uuid,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    admin_note text,
    processed_by uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT withdraw_requests_amount_check CHECK ((amount >= (10000)::numeric)),
    CONSTRAINT withdraw_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'rejected'::character varying])::text[])))
);
ALTER TABLE public.withdraw_requests OWNER TO postgres;
COPY public.admin_sessions (session_id, admin_id, token_hash, ip_address, user_agent, expires_at, revoked_at, created_at) FROM stdin;
49295f93-5639-416a-999a-3c35a81fe940	a1166982-3803-4093-aa6d-04c2c8976ee5	1cfd9f25c922eb77f866495efce38b3d288db15051e95a3de8a1e3fa6ebe9315	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-03-31 22:45:42.150478+07	\N	2026-03-31 14:45:42.150478+07
2316b304-ab4d-4bbe-a383-5a9f59441b61	a1166982-3803-4093-aa6d-04c2c8976ee5	297df547307dabe31cd8fa8649eff768e7d37fd1390937b08ba8ae5934b5549e	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.7920	2026-03-31 22:47:14.801991+07	\N	2026-03-31 14:47:14.801991+07
bb7fbd61-a0d6-42cf-8739-7bdec1011973	a1166982-3803-4093-aa6d-04c2c8976ee5	10ab8ef356e538503dbfe8a60100dbc9589f9b52be9ea78dc45716697f74c151	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-03-31 22:47:42.745399+07	2026-03-31 14:48:13.725516+07	2026-03-31 14:47:42.745399+07
ae9e0cb0-f98f-48a0-82fc-0e39e8c17218	a1166982-3803-4093-aa6d-04c2c8976ee5	c0ed8b9979667df4de8a26251ee155a75520e719e49565d1a0a9175e50df76f6	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-03-31 23:07:27.432519+07	\N	2026-03-31 15:07:27.432519+07
450494ee-1ac7-44e1-886a-15ec8b61d9ed	a1166982-3803-4093-aa6d-04c2c8976ee5	10b0b8b30fd7b7352b190d111efbb86cd1763c6cc921930fdfcf80dfc6c747b1	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-03-31 23:08:02.482131+07	\N	2026-03-31 15:08:02.482131+07
1098aee1-eb05-46b5-819b-ee0a4db3f702	a1166982-3803-4093-aa6d-04c2c8976ee5	cdd9837c98e9014272a3af134081d1973212a21399c81ea3042920f21cce7e14	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-03-31 23:08:19.566496+07	\N	2026-03-31 15:08:19.566496+07
e4af48ff-fcc1-44a0-9dc1-e7160d815b3f	a1166982-3803-4093-aa6d-04c2c8976ee5	91cc6d6fa098f30fa878765752368aa7a18a3c4733bec53204b5a9f63e3d4ede	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-02 04:28:50.779868+07	\N	2026-04-01 20:28:50.779868+07
ee7ddfa0-7d5a-46d4-ab91-21d5ff1b458c	a1166982-3803-4093-aa6d-04c2c8976ee5	6fcc518e571299e92ddc844953823fcee9d9a1b062ad4b8924417c44c3c99bc8	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-02 04:50:25.759879+07	2026-04-01 21:08:00.460018+07	2026-04-01 20:50:25.759879+07
9291c13d-899d-4dc3-af42-f83f483e795c	a1166982-3803-4093-aa6d-04c2c8976ee5	70f65dcf6cf28cecb25154458e6cc0ddf5864a6ddfcf9c71368e28d58bc53949	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-02 05:08:06.012182+07	\N	2026-04-01 21:08:06.012182+07
\.
COPY public.admins (admin_id, username, password_hash, full_name, email, role, is_active, last_login_at, created_at, updated_at) FROM stdin;
a1166982-3803-4093-aa6d-04c2c8976ee5	admin	$2a$12$Cump7tIdTrYKjF0dBcYoleKSRMzb75V54sk0AcAOb2Mz9MHvSN4pu	Quản trị viên	admin@parking.local	superadmin	t	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
\.
COPY public.authorizations (auth_id, vehicle_id, owner_user_id, delegate_name, delegate_face_image, delegate_embedding, auth_type, valid_from, valid_until, is_active, is_consumed, consumed_at, model_version, created_at) FROM stdin;
\.
COPY public.daily_reports (report_id, lot_id, report_date, total_sessions, member_sessions, guest_sessions_count, total_revenue, member_revenue, guest_revenue, auth_success_count, auth_failed_count, auth_fallback_guest_count, avg_duration_minutes, hourly_occupancy, peak_hour, generated_at) FROM stdin;
\.
COPY public.device_status_logs (log_id, device_id, status, message, logged_at) FROM stdin;
\.
COPY public.devices (device_id, lot_id, device_name, device_type, lane, ip_address, serial_port, baud_rate, status, last_heartbeat, notes, created_at, updated_at) FROM stdin;
8605967a-0c82-4d85-bd65-b89d22268d13	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Arduino - Cổng vào	arduino	entry	\N	COM3	9600	offline	\N	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
43ea7073-5a58-468a-a01c-05134ac01562	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Arduino - Cổng ra	arduino	exit	\N	COM4	9600	offline	\N	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
feea7049-d75d-42c0-b0fa-6cce463c01cf	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Camera khuôn mặt - Cổng vào	camera_face	entry	192.168.1.101	\N	9600	offline	\N	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
6c9b3f39-194a-4a82-a00a-00e0f212dc03	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Camera biển số - Cổng vào	camera_plate	entry	192.168.1.102	\N	9600	offline	\N	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
49ed8586-b644-4556-b824-4ea6c1112c70	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Camera khuôn mặt - Cổng ra	camera_face	exit	192.168.1.103	\N	9600	offline	\N	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
c7e880bf-d86d-45ac-af0d-ea8d6e6f5b79	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Camera biển số - Cổng ra	camera_plate	exit	192.168.1.104	\N	9600	offline	\N	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
60def6cd-85ad-45fe-a69c-9ccf12907b6b	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Barrier - Cổng vào	barrier	entry	\N	\N	9600	offline	\N	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
78e41d47-f04c-4df8-ac74-568451a07958	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Barrier - Cổng ra	barrier	exit	\N	\N	9600	offline	\N	\N	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
\.
COPY public.event_logs (event_id, lot_id, event_type, session_id, session_kind, user_id, admin_id, device_id, license_plate, description, metadata, created_at) FROM stdin;
59eb693c-1f15-41f4-a70b-6223ba471b2d	\N	SESSION_FORCE_ENDED	cc000001-0000-0000-0000-000000000002	\N	\N	a1166982-3803-4093-aa6d-04c2c8976ee5	\N	\N	Kết thúc cưỡng bức: d	\N	2026-03-31 21:30:39.453644+07
10d24845-e0d7-4bad-883c-5bc6597b9722	\N	session_force_ended	dd000001-0000-0000-0000-000000000002	\N	\N	a1166982-3803-4093-aa6d-04c2c8976ee5	\N	51B-112.23	Kết thúc cưỡng bức (vãng lai): a	\N	2026-04-01 21:03:44.976879+07
\.
COPY public.face_embeddings (embedding_id, user_id, embedding, face_image_path, model_version, is_primary, is_active, created_at, updated_at) FROM stdin;
\.
COPY public.fcm_tokens (token_id, user_id, token, device_type, device_info, is_active, created_at, updated_at) FROM stdin;
\.
COPY public.guest_sessions (session_id, session_code, license_plate, lot_id, entry_time, exit_time, duration_minutes, entry_face_image_path, entry_plate_image_path, entry_composite_image_path, exit_composite_image_path, fee, payment_gateway, gateway_transaction_id, payment_status, paid_at, status, abnormal_reason, is_synced, created_at, updated_at) FROM stdin;
dd000001-0000-0000-0000-000000000001	GX-260101	52F-445.67	c9f3967e-15ce-4010-8376-fac0ff9bacf3	2026-03-31 14:35:02.12005+07	\N	\N	\N	\N	\N	\N	\N	\N	\N	pending	\N	active	\N	f	2026-03-31 15:43:02.12005+07	2026-03-31 15:43:02.12005+07
dd000001-0000-0000-0000-000000000003	GX-260103	30H-888.99	c9f3967e-15ce-4010-8376-fac0ff9bacf3	2026-03-31 12:53:02.12005+07	\N	\N	\N	\N	\N	\N	\N	\N	\N	pending	\N	active	\N	f	2026-03-31 15:43:02.12005+07	2026-03-31 15:43:02.12005+07
dd000001-0000-0000-0000-000000000005	GX-260105	51K-321.00	c9f3967e-15ce-4010-8376-fac0ff9bacf3	2026-03-31 14:48:02.12005+07	\N	\N	\N	\N	\N	\N	\N	\N	\N	pending	\N	active	\N	f	2026-03-31 15:43:02.12005+07	2026-03-31 15:43:02.12005+07
dd000001-0000-0000-0000-000000000004	GX-260104	\N	c9f3967e-15ce-4010-8376-fac0ff9bacf3	2026-03-31 15:25:02.12005+07	2026-03-31 21:30:44.359785+07	\N	\N	\N	\N	\N	\N	\N	\N	pending	\N	abnormal	a	f	2026-03-31 15:43:02.12005+07	2026-03-31 21:30:44.359785+07
dd000001-0000-0000-0000-000000000002	GX-260102	51B-112.23	c9f3967e-15ce-4010-8376-fac0ff9bacf3	2026-03-31 15:08:02.12005+07	2026-04-01 21:03:44.970021+07	1795	\N	\N	\N	\N	\N	\N	\N	pending	\N	abnormal	a	f	2026-03-31 15:43:02.12005+07	2026-04-01 21:03:44.970021+07
\.
COPY public.manual_overrides (override_id, lot_id, admin_id, device_id, action, reason, related_session_id, related_license_plate, ip_address, executed_at) FROM stdin;
\.
COPY public.monthly_passes (pass_id, user_id, vehicle_id, lot_id, license_plate, valid_from, valid_until, fee_paid, wallet_tx_id, status, note, created_at, updated_at) FROM stdin;
0dc6de3b-cffe-4842-b545-60a152162b48	cb3be902-5237-4b0d-bd6b-adb839a64ab6	760d4f58-a0b3-44d5-80a4-c05a4f1bbbdc	c9f3967e-15ce-4010-8376-fac0ff9bacf3	15AL-04344	2026-03-31	2026-04-30	200000.00	223dfd8f-b8c1-42a8-9989-699ca3e233fb	active	\N	2026-03-31 20:59:16.471071+07	2026-03-31 20:59:16.471071+07
62ef369a-bb26-4a77-bf71-46fafa122c4c	4ac3b376-d797-4bed-863c-e1a4288b5e44	9ee45aec-6165-4909-86bf-0536028aba11	c9f3967e-15ce-4010-8376-fac0ff9bacf3	15AN-04434	2026-03-31	2026-04-30	200000.00	5f2d0a5a-0ff1-45c6-8748-a513dea14755	active	\N	2026-03-31 21:03:26.900366+07	2026-03-31 21:03:26.900366+07
\.
COPY public.notifications (notification_id, user_id, type, title, body, data, is_read, created_at) FROM stdin;
ee0a4ac1-386a-4fa4-b31d-a091fe523648	a1b2c3d4-0000-0000-0000-000000000001	topup_success	Nạp tiền thành công	Ví của bạn vừa được nạp 200,000 VND qua MoMo. Số dư hiện tại: 200,000 VND	\N	t	2026-03-31 14:40:54.809692+07
ae0a1176-02e8-4ef5-a066-c45aad52d2c5	a1b2c3d4-0000-0000-0000-000000000001	vehicle_entry	Xe đã vào bãi	Xe 29B1-12345 đã vào bãi lúc 12:40 28/03	\N	t	2026-03-31 14:40:54.809692+07
934aeba3-dc8f-471a-a2d0-eedfd1a862ca	a1b2c3d4-0000-0000-0000-000000000001	fee_deducted	Trừ phí gửi xe	Phí gửi xe 29B1-12345: 10,000 VND. Số dư còn lại: 190,000 VND	\N	t	2026-03-31 14:40:54.809692+07
05e4c5c2-52b2-4bbd-8643-914f06d3fa56	a1b2c3d4-0000-0000-0000-000000000001	low_balance	Số dư sắp hết	Số dư ví của bạn chỉ còn 30,000 VND. Hãy nạp thêm để tiếp tục sử dụng dịch vụ.	\N	f	2026-03-31 14:40:54.809692+07
e13e4fca-1d64-4022-8c63-144bde8e9195	a1b2c3d4-0000-0000-0000-000000000001	vehicle_entry	Xe đã vào bãi	Xe 30A-98765 đã vào bãi lúc 09:40 31/03	\N	f	2026-03-31 14:40:54.809692+07
8cdb7b22-321b-44fc-af2e-ced5d7b23658	a1b2c3d4-0000-0000-0000-000000000002	low_balance	Số dư sắp hết	Số dư ví của bạn chỉ còn 30,000 VND – thấp hơn ngưỡng cảnh báo 50,000 VND.	\N	f	2026-03-31 14:40:54.809692+07
\.
COPY public.parking_lots (lot_id, name, address, total_capacity, current_occupancy, phone, email, is_active, created_at, updated_at) FROM stdin;
c9f3967e-15ce-4010-8376-fac0ff9bacf3	Bãi Xe Thông Minh – Trường ĐH Hàng Hải Việt Nam	484 Lạch Tray, Đổng Quốc Bình, Lê Chân, Hải Phòng	100	7	0225-3829-250	baixe@vimaru.edu.vn	t	2026-03-31 14:36:19.334925+07	2026-04-01 21:03:44.974957+07
\.
COPY public.parking_sessions (session_id, vehicle_id, user_id, auth_id, session_type, license_plate, lot_id, entry_time, exit_time, duration_minutes, entry_face_image_path, entry_plate_image_path, entry_composite_image_path, exit_face_image_path, exit_plate_image_path, exit_composite_image_path, fee, wallet_transaction_id, status, abnormal_reason, force_ended_by, force_end_reason, is_synced, created_at, updated_at) FROM stdin;
cc000001-0000-0000-0000-000000000001	b1b2c3d4-0000-0000-0000-000000000001	a1b2c3d4-0000-0000-0000-000000000001	\N	member	29B1-12345	c9f3967e-15ce-4010-8376-fac0ff9bacf3	2026-03-31 13:58:02.12005+07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	active	\N	\N	\N	f	2026-03-31 15:43:02.12005+07	2026-03-31 15:43:02.12005+07
cc000002-0000-0000-0000-000000000001	b1b2c3d4-0000-0000-0000-000000000003	a1b2c3d4-0000-0000-0000-000000000002	\N	member	51F-11111	c9f3967e-15ce-4010-8376-fac0ff9bacf3	2026-03-31 13:23:02.12005+07	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	active	\N	\N	\N	f	2026-03-31 15:43:02.12005+07	2026-03-31 15:43:02.12005+07
cc000001-0000-0000-0000-000000000002	b1b2c3d4-0000-0000-0000-000000000002	a1b2c3d4-0000-0000-0000-000000000001	\N	member	30A-98765	c9f3967e-15ce-4010-8376-fac0ff9bacf3	2026-03-31 15:13:02.12005+07	2026-03-31 21:30:39.447375+07	\N	\N	\N	\N	\N	\N	\N	\N	\N	force_ended	\N	a1166982-3803-4093-aa6d-04c2c8976ee5	d	f	2026-03-31 15:43:02.12005+07	2026-03-31 21:30:39.447375+07
\.
COPY public.pricing_configs (config_id, lot_id, time_slot_name, start_hour, end_hour, price_per_hour, minimum_fee, is_active, created_at, updated_at) FROM stdin;
ddcfe221-b89c-4a8c-816b-ff2c40d38a7c	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Ban ngày	6	22	5000.00	2000.00	t	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
646566a5-afc0-451f-93a4-6787b2051a20	c9f3967e-15ce-4010-8376-fac0ff9bacf3	Ban đêm	22	6	3000.00	2000.00	t	2026-03-31 14:36:19.334925+07	2026-03-31 14:36:19.334925+07
\.
COPY public.refresh_tokens (token_id, user_id, token_hash, device_info, ip_address, expires_at, revoked_at, created_at) FROM stdin;
a7438681-29d3-4593-bc78-79b6b664bc06	a1b2c3d4-0000-0000-0000-000000000002	48a3a99cb0c0c4560ccee2f8b25011c911961baa32e0fe4a69dda8538abcc7c0	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	::1	2026-03-31 22:55:50.606717+07	2026-03-31 14:56:51.83898+07	2026-03-31 14:55:50.606717+07
02623ac1-440b-4fd4-958c-130f83f3073f	53052b34-17a0-4025-b905-c4651533fbbd	aff342a31e785d7d1163c14738094de4cf2b6ff78768b8132a1aba240c92b809	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	::1	2026-03-31 23:02:53.545238+07	2026-03-31 15:06:02.007653+07	2026-03-31 15:02:53.545238+07
51abfdd4-5aed-4086-8770-6dabf39b3c54	cb3be902-5237-4b0d-bd6b-adb839a64ab6	a5be8c838f14ead508de870e66122b5a2c45e071d1cb5ea7f9853f9f462c254b	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	::1	2026-03-31 23:17:33.902256+07	\N	2026-03-31 15:17:33.902256+07
4867a70e-778b-40c5-ada7-2bb590e76e77	cb3be902-5237-4b0d-bd6b-adb839a64ab6	3f1029b69b21e5100976f884fb04e7c2a2801738e04512d8542385d31f8260bb	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	::1	2026-04-01 04:05:42.558565+07	2026-03-31 21:00:06.535001+07	2026-03-31 20:05:42.558565+07
365d7fb7-79de-4f29-8797-fcf3f8c52637	4ac3b376-d797-4bed-863c-e1a4288b5e44	93b24ab944122583655037f0c9e8073b66910f4093671fc71b3a5bd6553f3a8c	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	::1	2026-04-01 05:00:59.872131+07	2026-03-31 21:03:49.515802+07	2026-03-31 21:00:59.872131+07
7f8725bc-01d1-4091-a0b8-d1921cc3d61d	4ac3b376-d797-4bed-863c-e1a4288b5e44	747bb1d68b7f49abaf9650b27611055fc19fb814878bf1e88d60e6c9b5794c47	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	::1	2026-04-01 05:04:14.795764+07	\N	2026-03-31 21:04:14.795764+07
8ce5c962-4f72-47ae-a107-6a5d8670ff1a	cb3be902-5237-4b0d-bd6b-adb839a64ab6	88876fa8b652fd764f8b6f010983e250c57c1d6d5635196991048008ed05da96	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	::1	2026-04-02 04:33:56.634349+07	2026-04-01 21:07:53.127348+07	2026-04-01 20:33:56.634349+07
\.
COPY public.report_exports (export_id, admin_id, lot_id, report_type, date_from, date_to, file_format, file_path, file_size_bytes, status, created_at, completed_at) FROM stdin;
\.
COPY public.sync_queue (queue_id, lot_id, entity_type, entity_id, operation, payload, status, retry_count, last_error, created_at, synced_at) FROM stdin;
\.
COPY public.system_alerts (alert_id, lot_id, alert_type, severity, title, description, related_device_id, related_user_id, related_session_id, status, resolved_by, resolved_at, resolution_note, created_at) FROM stdin;
\.
COPY public.system_configs (config_key, config_value, data_type, description, updated_by, updated_at) FROM stdin;
low_balance_default_threshold	50000	decimal	Ngưỡng số dư thấp mặc định (VND)	\N	2026-03-31 14:36:19.334925+07
max_parking_hours_alert	24	integer	Số giờ tối đa trước khi đánh dấu phiên bất thường	\N	2026-03-31 14:36:19.334925+07
face_match_threshold	0.6	decimal	Ngưỡng Cosine Similarity tối thiểu để chấp nhận khuôn mặt	\N	2026-03-31 14:36:19.334925+07
max_verify_attempts	3	integer	Số lần thử nhận diện tối đa trước khi chuyển khách vãng lai	\N	2026-03-31 14:36:19.334925+07
camera_capture_timeout_ms	5000	integer	Timeout chụp ảnh 2 camera (ms)	\N	2026-03-31 14:36:19.334925+07
barrier_auto_close_delay_ms	3000	integer	Thời gian delay đóng barrier sau khi xe qua (ms)	\N	2026-03-31 14:36:19.334925+07
offline_sync_retry_interval_s	30	integer	Chu kỳ thử đồng bộ lại khi có mạng (giây)	\N	2026-03-31 14:36:19.334925+07
guest_session_code_prefix	GX	string	Tiền tố mã phiên khách vãng lai	\N	2026-03-31 14:36:19.334925+07
monthly_pass_price	200000	integer	Giá vé tháng gửi xe (VND/tháng/xe)	\N	2026-03-31 20:58:00.876638+07
\.
COPY public.user_face_images (image_id, user_id, image_path, status, embedding_id, note, created_at, updated_at) FROM stdin;
f7d46258-a026-4c67-9627-f17c0a86fb64	cb3be902-5237-4b0d-bd6b-adb839a64ab6	faces/cb3be902-5237-4b0d-bd6b-adb839a64ab6/1774963532911.jpg	pending	\N	\N	2026-03-31 20:25:32.91588+07	2026-03-31 20:25:32.91588+07
\.
COPY public.users (user_id, full_name, phone_number, email, password_hash, avatar_path, is_active, is_verified, created_at, updated_at) FROM stdin;
a1b2c3d4-0000-0000-0000-000000000001	Nguyễn Văn An	0901234567	\N	$2a$12$m.hOBc96iJ0o1oWZoAQmDur6kUcMcc5xNoYZAuSCm1F0w43ARUApq	\N	t	t	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
a1b2c3d4-0000-0000-0000-000000000002	Trần Thị Bình	0912345678	\N	$2a$12$Z7YgamJwsasQjmTV/86/p.3J.cB8DlDwF8PfF6BIlxzKvFFTagPxO	\N	t	f	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
53052b34-17a0-4025-b905-c4651533fbbd	Nguyễn Trung Hiếu	0862152329	\N	$2a$12$AIDhPTD6fMiNFrb/xkRgBemA82.E.utgdE7m0IGieYzOwEduBrSvC	\N	t	f	2026-03-31 15:02:39.88183+07	2026-03-31 15:02:39.88183+07
cb3be902-5237-4b0d-bd6b-adb839a64ab6	Nguyễn Trung Hiếu	0862152328	\N	$2a$12$g1B34qhbr1bd7PtXAyNuUuQO6ZrXKOXS5pZXAhRuB5nWZO1GCHNj.	\N	t	f	2026-03-31 14:57:10.932641+07	2026-03-31 15:15:12.808483+07
4ac3b376-d797-4bed-863c-e1a4288b5e44	Ngô Quang Hào	0376783065	\N	$2a$12$..M8RF6NovebQt/cVNTfL.OgcmCxd/.Oh26wunhxP.xrd4UmAVgeK	\N	t	f	2026-03-31 21:00:43.083741+07	2026-04-01 20:57:03.284186+07
\.
COPY public.vehicles (vehicle_id, user_id, license_plate, plate_image_path, nickname, is_active, created_at, updated_at) FROM stdin;
b1b2c3d4-0000-0000-0000-000000000001	a1b2c3d4-0000-0000-0000-000000000001	29B1-12345	\N	Xe đi làm	t	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
b1b2c3d4-0000-0000-0000-000000000002	a1b2c3d4-0000-0000-0000-000000000001	30A-98765	\N	Xe của vợ	t	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
b1b2c3d4-0000-0000-0000-000000000003	a1b2c3d4-0000-0000-0000-000000000002	51F-11111	\N	Xe cá nhân	t	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
23ba1a59-a642-441e-b7da-393b2a141ec4	53052b34-17a0-4025-b905-c4651533fbbd	AL-02122	\N	Xe đi lại	t	2026-03-31 15:03:12.152696+07	2026-03-31 15:03:12.152696+07
760d4f58-a0b3-44d5-80a4-c05a4f1bbbdc	cb3be902-5237-4b0d-bd6b-adb839a64ab6	15AL-04344	\N	Xe hào chó	t	2026-03-31 20:58:57.767758+07	2026-03-31 20:58:57.767758+07
9ee45aec-6165-4909-86bf-0536028aba11	4ac3b376-d797-4bed-863c-e1a4288b5e44	15AN-04434	\N	Xe xích lô 	t	2026-03-31 21:03:08.826416+07	2026-03-31 21:03:17.570144+07
\.
COPY public.wallet_transactions (transaction_id, wallet_id, user_id, transaction_type, amount, balance_before, balance_after, payment_gateway, gateway_transaction_id, gateway_reference_code, gateway_response_code, parking_session_id, status, description, created_at, updated_at) FROM stdin;
a9eb026b-d848-4cc8-8452-66ef3d38e601	d7081620-2580-4986-b69d-79f96d3b0d7d	a1b2c3d4-0000-0000-0000-000000000001	topup	200000.00	0.00	200000.00	momo	\N	\N	\N	\N	success	Nạp tiền lần đầu	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
e54d7561-f44f-42d5-872f-67b61d603e0a	d7081620-2580-4986-b69d-79f96d3b0d7d	a1b2c3d4-0000-0000-0000-000000000001	deduct	10000.00	200000.00	190000.00	\N	\N	\N	\N	\N	success	Phí gửi xe 2 tiếng	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
289b54da-2ed1-47db-ae8f-9a3813612e50	d7081620-2580-4986-b69d-79f96d3b0d7d	a1b2c3d4-0000-0000-0000-000000000001	deduct	5000.00	190000.00	185000.00	\N	\N	\N	\N	\N	success	Phí gửi xe 1 tiếng	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
b3ed594a-da39-42ed-9659-47458037e410	d7081620-2580-4986-b69d-79f96d3b0d7d	a1b2c3d4-0000-0000-0000-000000000001	topup	100000.00	185000.00	285000.00	vnpay	\N	\N	\N	\N	success	Nạp thêm tiền	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
fcafe478-0b81-48e6-96d8-76b9346ed5fb	d7081620-2580-4986-b69d-79f96d3b0d7d	a1b2c3d4-0000-0000-0000-000000000001	deduct	135000.00	285000.00	150000.00	\N	\N	\N	\N	\N	success	Phí gửi xe nhiều lần	2026-03-31 14:40:54.809692+07	2026-03-31 14:40:54.809692+07
b04e7b69-c56e-42a7-9273-d34e3bc48cc4	8f5a64e8-0976-4928-bf36-3b1042311356	a1b2c3d4-0000-0000-0000-000000000002	topup	50000.00	30000.00	80000.00	momo	\N	\N	\N	\N	success	Nạp tiền vào ví	2026-03-31 14:56:33.251346+07	2026-03-31 14:56:33.251346+07
0759f852-9f89-4e2f-a5db-b7e9b70c6b27	30b952fe-e8cf-4b22-a9f9-5b00ed6d9740	53052b34-17a0-4025-b905-c4651533fbbd	topup	500000.00	0.00	500000.00	momo	\N	\N	\N	\N	success	Nạp tiền vào ví	2026-03-31 15:03:48.648253+07	2026-03-31 15:03:48.648253+07
df4c8ffb-bd3e-4bc9-9e37-6cf1a019975d	8b30f9d8-fe95-437c-9f4e-bb2309acce45	cb3be902-5237-4b0d-bd6b-adb839a64ab6	topup	200000.00	0.00	200000.00	momo	\N	\N	\N	\N	success	Nạp tiền vào ví	2026-03-31 15:28:51.935056+07	2026-03-31 15:28:51.935056+07
223dfd8f-b8c1-42a8-9989-699ca3e233fb	8b30f9d8-fe95-437c-9f4e-bb2309acce45	cb3be902-5237-4b0d-bd6b-adb839a64ab6	deduct	200000.00	200000.00	0.00	system	\N	\N	\N	\N	success	Mua vé tháng 1 tháng – 15AL-04344	2026-03-31 20:59:16.471071+07	2026-03-31 20:59:16.471071+07
abed35ac-5acf-44d8-9f8c-c64498f7ea04	be0d69fd-3773-4a4f-b48a-ca25b4e0c8db	4ac3b376-d797-4bed-863c-e1a4288b5e44	topup	500000.00	0.00	500000.00	momo	\N	\N	\N	\N	success	Nạp tiền vào ví	2026-03-31 21:01:11.49607+07	2026-03-31 21:01:11.49607+07
de71d42a-a8b4-4461-b0d9-6744f6ad0381	be0d69fd-3773-4a4f-b48a-ca25b4e0c8db	4ac3b376-d797-4bed-863c-e1a4288b5e44	withdraw	200000.00	500000.00	300000.00	bank_transfer	\N	\N	\N	\N	pending	Yêu cầu rút tiền – đang xử lý	2026-03-31 21:02:01.259218+07	2026-03-31 21:02:01.259218+07
5f2d0a5a-0ff1-45c6-8748-a513dea14755	be0d69fd-3773-4a4f-b48a-ca25b4e0c8db	4ac3b376-d797-4bed-863c-e1a4288b5e44	deduct	200000.00	300000.00	100000.00	system	\N	\N	\N	\N	success	Mua vé tháng 1 tháng – 15AN-04434	2026-03-31 21:03:26.900366+07	2026-03-31 21:03:26.900366+07
b20560e2-1543-490a-b208-a3a9d8439ce0	be0d69fd-3773-4a4f-b48a-ca25b4e0c8db	4ac3b376-d797-4bed-863c-e1a4288b5e44	topup	200000.00	100000.00	300000.00	momo	\N	\N	\N	\N	success	Nạp tiền vào ví	2026-03-31 21:04:40.667093+07	2026-03-31 21:04:40.667093+07
8fd6112f-b249-43d8-9840-a00372db6e0a	8b30f9d8-fe95-437c-9f4e-bb2309acce45	cb3be902-5237-4b0d-bd6b-adb839a64ab6	topup	500000.00	0.00	500000.00	momo	\N	\N	\N	\N	success	Nạp tiền vào ví	2026-04-01 20:34:30.111126+07	2026-04-01 20:34:30.111126+07
\.
COPY public.wallets (wallet_id, user_id, balance, low_balance_threshold, updated_at) FROM stdin;
d7081620-2580-4986-b69d-79f96d3b0d7d	a1b2c3d4-0000-0000-0000-000000000001	150000.00	50000.00	2026-03-31 14:40:54.809692+07
8f5a64e8-0976-4928-bf36-3b1042311356	a1b2c3d4-0000-0000-0000-000000000002	80000.00	50000.00	2026-03-31 14:56:33.251346+07
30b952fe-e8cf-4b22-a9f9-5b00ed6d9740	53052b34-17a0-4025-b905-c4651533fbbd	500000.00	50000.00	2026-03-31 15:03:48.648253+07
be0d69fd-3773-4a4f-b48a-ca25b4e0c8db	4ac3b376-d797-4bed-863c-e1a4288b5e44	300000.00	50000.00	2026-03-31 21:04:40.667093+07
8b30f9d8-fe95-437c-9f4e-bb2309acce45	cb3be902-5237-4b0d-bd6b-adb839a64ab6	500000.00	50000.00	2026-04-01 20:34:30.111126+07
\.
COPY public.withdraw_requests (request_id, user_id, amount, bank_name, bank_account, account_name, wallet_tx_id, status, admin_note, processed_by, processed_at, created_at, updated_at) FROM stdin;
78fc409e-9f69-4912-800a-b538b3792477	4ac3b376-d797-4bed-863c-e1a4288b5e44	200000.00	BIDV	33737373	Nguyễn Trung Hiếu	de71d42a-a8b4-4461-b0d9-6744f6ad0381	pending	\N	\N	\N	2026-03-31 21:02:01.259218+07	2026-03-31 21:02:01.259218+07
\.
ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (session_id);
ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);
ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (admin_id);
ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_username_key UNIQUE (username);
ALTER TABLE ONLY public.authorizations
    ADD CONSTRAINT authorizations_pkey PRIMARY KEY (auth_id);
ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_lot_id_report_date_key UNIQUE (lot_id, report_date);
ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_pkey PRIMARY KEY (report_id);
ALTER TABLE ONLY public.device_status_logs
    ADD CONSTRAINT device_status_logs_pkey PRIMARY KEY (log_id);
ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (device_id);
ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_pkey PRIMARY KEY (event_id);
ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_pkey PRIMARY KEY (embedding_id);
ALTER TABLE ONLY public.fcm_tokens
    ADD CONSTRAINT fcm_tokens_pkey PRIMARY KEY (token_id);
ALTER TABLE ONLY public.fcm_tokens
    ADD CONSTRAINT fcm_tokens_user_id_token_key UNIQUE (user_id, token);
ALTER TABLE ONLY public.guest_sessions
    ADD CONSTRAINT guest_sessions_pkey PRIMARY KEY (session_id);
ALTER TABLE ONLY public.guest_sessions
    ADD CONSTRAINT guest_sessions_session_code_key UNIQUE (session_code);
ALTER TABLE ONLY public.manual_overrides
    ADD CONSTRAINT manual_overrides_pkey PRIMARY KEY (override_id);
ALTER TABLE ONLY public.monthly_passes
    ADD CONSTRAINT monthly_passes_pkey PRIMARY KEY (pass_id);
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);
ALTER TABLE ONLY public.parking_lots
    ADD CONSTRAINT parking_lots_pkey PRIMARY KEY (lot_id);
ALTER TABLE ONLY public.parking_sessions
    ADD CONSTRAINT parking_sessions_pkey PRIMARY KEY (session_id);
ALTER TABLE ONLY public.pricing_configs
    ADD CONSTRAINT pricing_configs_pkey PRIMARY KEY (config_id);
ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (token_id);
ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.report_exports
    ADD CONSTRAINT report_exports_pkey PRIMARY KEY (export_id);
ALTER TABLE ONLY public.sync_queue
    ADD CONSTRAINT sync_queue_pkey PRIMARY KEY (queue_id);
ALTER TABLE ONLY public.system_alerts
    ADD CONSTRAINT system_alerts_pkey PRIMARY KEY (alert_id);
ALTER TABLE ONLY public.system_configs
    ADD CONSTRAINT system_configs_pkey PRIMARY KEY (config_key);
ALTER TABLE ONLY public.user_face_images
    ADD CONSTRAINT user_face_images_pkey PRIMARY KEY (image_id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_number_key UNIQUE (phone_number);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_license_plate_key UNIQUE (license_plate);
ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (vehicle_id);
ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (transaction_id);
ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (wallet_id);
ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);
ALTER TABLE ONLY public.withdraw_requests
    ADD CONSTRAINT withdraw_requests_pkey PRIMARY KEY (request_id);
CREATE INDEX idx_admin_sessions_admin ON public.admin_sessions USING btree (admin_id);
CREATE INDEX idx_auth_active ON public.authorizations USING btree (vehicle_id, is_active, auth_type);
CREATE INDEX idx_auth_owner ON public.authorizations USING btree (owner_user_id);
CREATE INDEX idx_auth_vehicle ON public.authorizations USING btree (vehicle_id);
CREATE INDEX idx_daily_reports_lot_date ON public.daily_reports USING btree (lot_id, report_date DESC);
CREATE INDEX idx_device_status_logs_device ON public.device_status_logs USING btree (device_id, logged_at DESC);
CREATE INDEX idx_devices_lot ON public.devices USING btree (lot_id);
CREATE INDEX idx_devices_type ON public.devices USING btree (device_type);
CREATE INDEX idx_event_logs_lot_time ON public.event_logs USING btree (lot_id, created_at DESC);
CREATE INDEX idx_event_logs_plate ON public.event_logs USING btree (license_plate) WHERE (license_plate IS NOT NULL);
CREATE INDEX idx_event_logs_session ON public.event_logs USING btree (session_id) WHERE (session_id IS NOT NULL);
CREATE INDEX idx_event_logs_type ON public.event_logs USING btree (event_type, created_at DESC);
CREATE INDEX idx_event_logs_user ON public.event_logs USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_face_embeddings_user ON public.face_embeddings USING btree (user_id);
CREATE INDEX idx_fcm_tokens_user ON public.fcm_tokens USING btree (user_id) WHERE (is_active = true);
CREATE INDEX idx_guest_sessions_active ON public.guest_sessions USING btree (status, lot_id) WHERE ((status)::text = 'active'::text);
CREATE INDEX idx_guest_sessions_code ON public.guest_sessions USING btree (session_code);
CREATE INDEX idx_guest_sessions_plate ON public.guest_sessions USING btree (license_plate) WHERE (license_plate IS NOT NULL);
CREATE INDEX idx_guest_sessions_synced ON public.guest_sessions USING btree (is_synced) WHERE (is_synced = false);
CREATE INDEX idx_manual_overrides_admin ON public.manual_overrides USING btree (admin_id, executed_at DESC);
CREATE INDEX idx_monthly_passes_active ON public.monthly_passes USING btree (user_id, status) WHERE ((status)::text = 'active'::text);
CREATE INDEX idx_monthly_passes_user ON public.monthly_passes USING btree (user_id);
CREATE INDEX idx_monthly_passes_vehicle ON public.monthly_passes USING btree (vehicle_id);
CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX idx_parking_sessions_active ON public.parking_sessions USING btree (status, lot_id) WHERE ((status)::text = 'active'::text);
CREATE INDEX idx_parking_sessions_plate ON public.parking_sessions USING btree (license_plate);
CREATE INDEX idx_parking_sessions_synced ON public.parking_sessions USING btree (is_synced) WHERE (is_synced = false);
CREATE INDEX idx_parking_sessions_user ON public.parking_sessions USING btree (user_id, entry_time DESC);
CREATE INDEX idx_parking_sessions_vehicle ON public.parking_sessions USING btree (vehicle_id, entry_time DESC);
CREATE INDEX idx_parking_sessions_plate_active ON public.parking_sessions USING btree (license_plate) WHERE ((status)::text = 'active'::text);
CREATE INDEX idx_guest_sessions_plate_active ON public.guest_sessions USING btree (license_plate) WHERE ((status)::text = 'active'::text);
CREATE INDEX idx_pricing_lot ON public.pricing_configs USING btree (lot_id, is_active);
CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);
CREATE INDEX idx_sync_queue_pending ON public.sync_queue USING btree (status, created_at) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'failed'::character varying])::text[]));
CREATE INDEX idx_system_alerts_lot ON public.system_alerts USING btree (lot_id, created_at DESC);
CREATE INDEX idx_system_alerts_unresolved ON public.system_alerts USING btree (status, severity, created_at DESC) WHERE ((status)::text = 'unresolved'::text);
CREATE INDEX idx_user_face_images_pending ON public.user_face_images USING btree (status) WHERE ((status)::text = 'pending'::text);
CREATE INDEX idx_user_face_images_status ON public.user_face_images USING btree (status);
CREATE INDEX idx_user_face_images_user ON public.user_face_images USING btree (user_id);
CREATE INDEX idx_users_phone ON public.users USING btree (phone_number);
CREATE INDEX idx_vehicles_license_plate ON public.vehicles USING btree (license_plate);
CREATE INDEX idx_vehicles_user ON public.vehicles USING btree (user_id);
CREATE INDEX idx_wallet_tx_gateway ON public.wallet_transactions USING btree (gateway_transaction_id) WHERE (gateway_transaction_id IS NOT NULL);
CREATE INDEX idx_wallet_tx_status ON public.wallet_transactions USING btree (status) WHERE ((status)::text = 'pending'::text);
CREATE INDEX idx_wallet_tx_user ON public.wallet_transactions USING btree (user_id, created_at DESC);
CREATE INDEX idx_wallet_tx_wallet ON public.wallet_transactions USING btree (wallet_id, created_at DESC);
CREATE INDEX idx_withdraw_requests_status ON public.withdraw_requests USING btree (status) WHERE ((status)::text = 'pending'::text);
CREATE INDEX idx_withdraw_requests_user ON public.withdraw_requests USING btree (user_id, created_at DESC);
CREATE TRIGGER auto_create_wallet AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.trigger_create_wallet_for_new_user();
CREATE TRIGGER log_device_status AFTER UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.trigger_log_device_status_change();
CREATE TRIGGER set_updated_at_admins BEFORE UPDATE ON public.admins FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_devices BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_fcm_tokens BEFORE UPDATE ON public.fcm_tokens FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_guest_sessions BEFORE UPDATE ON public.guest_sessions FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_monthly_passes BEFORE UPDATE ON public.monthly_passes FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_parking_lots BEFORE UPDATE ON public.parking_lots FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_parking_sessions BEFORE UPDATE ON public.parking_sessions FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_pricing_configs BEFORE UPDATE ON public.pricing_configs FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_vehicles BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_wallet_transactions BEFORE UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_wallets BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at_withdraw_requests BEFORE UPDATE ON public.withdraw_requests FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER trg_face_images_updated_at BEFORE UPDATE ON public.user_face_images FOR EACH ROW EXECUTE FUNCTION public.update_face_images_updated_at();
ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(admin_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.authorizations
    ADD CONSTRAINT authorizations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.authorizations
    ADD CONSTRAINT authorizations_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(vehicle_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id);
ALTER TABLE ONLY public.device_status_logs
    ADD CONSTRAINT device_status_logs_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id);
ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(admin_id);
ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id);
ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id);
ALTER TABLE ONLY public.face_embeddings
    ADD CONSTRAINT face_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fcm_tokens
    ADD CONSTRAINT fcm_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.manual_overrides
    ADD CONSTRAINT manual_overrides_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(admin_id);
ALTER TABLE ONLY public.manual_overrides
    ADD CONSTRAINT manual_overrides_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id);
ALTER TABLE ONLY public.manual_overrides
    ADD CONSTRAINT manual_overrides_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id);
ALTER TABLE ONLY public.monthly_passes
    ADD CONSTRAINT monthly_passes_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.monthly_passes
    ADD CONSTRAINT monthly_passes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.monthly_passes
    ADD CONSTRAINT monthly_passes_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(vehicle_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.monthly_passes
    ADD CONSTRAINT monthly_passes_wallet_tx_id_fkey FOREIGN KEY (wallet_tx_id) REFERENCES public.wallet_transactions(transaction_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.parking_sessions
    ADD CONSTRAINT parking_sessions_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES public.authorizations(auth_id);
ALTER TABLE ONLY public.parking_sessions
    ADD CONSTRAINT parking_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);
ALTER TABLE ONLY public.parking_sessions
    ADD CONSTRAINT parking_sessions_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(vehicle_id);
ALTER TABLE ONLY public.parking_sessions
    ADD CONSTRAINT parking_sessions_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES public.wallet_transactions(transaction_id);
ALTER TABLE ONLY public.parking_sessions
    ADD CONSTRAINT parking_sessions_entry_device_id_fkey FOREIGN KEY (entry_device_id) REFERENCES public.devices(device_id);
ALTER TABLE ONLY public.parking_sessions
    ADD CONSTRAINT parking_sessions_exit_device_id_fkey FOREIGN KEY (exit_device_id) REFERENCES public.devices(device_id);
ALTER TABLE ONLY public.guest_sessions
    ADD CONSTRAINT guest_sessions_entry_device_id_fkey FOREIGN KEY (entry_device_id) REFERENCES public.devices(device_id);
ALTER TABLE ONLY public.guest_sessions
    ADD CONSTRAINT guest_sessions_exit_device_id_fkey FOREIGN KEY (exit_device_id) REFERENCES public.devices(device_id);
ALTER TABLE ONLY public.pricing_configs
    ADD CONSTRAINT pricing_configs_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_exports
    ADD CONSTRAINT report_exports_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(admin_id);
ALTER TABLE ONLY public.report_exports
    ADD CONSTRAINT report_exports_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id);
ALTER TABLE ONLY public.sync_queue
    ADD CONSTRAINT sync_queue_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id);
ALTER TABLE ONLY public.system_alerts
    ADD CONSTRAINT system_alerts_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.parking_lots(lot_id);
ALTER TABLE ONLY public.system_alerts
    ADD CONSTRAINT system_alerts_related_device_id_fkey FOREIGN KEY (related_device_id) REFERENCES public.devices(device_id);
ALTER TABLE ONLY public.system_alerts
    ADD CONSTRAINT system_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.admins(admin_id);
ALTER TABLE ONLY public.system_configs
    ADD CONSTRAINT system_configs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.admins(admin_id);
ALTER TABLE ONLY public.user_face_images
    ADD CONSTRAINT user_face_images_embedding_id_fkey FOREIGN KEY (embedding_id) REFERENCES public.face_embeddings(embedding_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.user_face_images
    ADD CONSTRAINT user_face_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);
ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(wallet_id);
ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.withdraw_requests
    ADD CONSTRAINT withdraw_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.admins(admin_id);
ALTER TABLE ONLY public.withdraw_requests
    ADD CONSTRAINT withdraw_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.withdraw_requests
    ADD CONSTRAINT withdraw_requests_wallet_tx_id_fkey FOREIGN KEY (wallet_tx_id) REFERENCES public.wallet_transactions(transaction_id) ON DELETE SET NULL;
\unrestrict BxkE3TZKHOKShbTCKahYnTUa35HtVX10g0VLhQxz4U4xBrO77HVkQ8hLW3qWbEu
