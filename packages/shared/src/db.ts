export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          company_id: string | null;
          id: string;
          new_data: Json | null;
          occurred_at: string;
          old_data: Json | null;
          record_id: string | null;
          table_name: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          company_id?: string | null;
          id?: string;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          company_id?: string | null;
          id?: string;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      business_unit_coordinators: {
        Row: {
          business_unit_id: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          profile_id: string;
        };
        ComputedFields: never;
        Insert: {
          business_unit_id: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          profile_id: string;
        };
        Update: {
          business_unit_id?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_unit_coordinators_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_unit_coordinators_unit_fkey';
            columns: ['company_id', 'business_unit_id'];
            isOneToOne: false;
            referencedRelation: 'business_units';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
      business_units: {
        Row: {
          archived_at: string | null;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_units_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_units_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
        ];
      };
      carrier_routes: {
        Row: {
          archived_at: string | null;
          company_id: string;
          created_at: string;
          destination_city: string;
          destination_location: unknown;
          destination_state: string;
          id: string;
          notes: string | null;
          origin_city: string;
          origin_location: unknown;
          origin_state: string;
          unit_types: Database['public']['Enums']['unit_type'][];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          company_id: string;
          created_at?: string;
          destination_city: string;
          destination_location?: unknown;
          destination_state: string;
          id?: string;
          notes?: string | null;
          origin_city: string;
          origin_location?: unknown;
          origin_state: string;
          unit_types?: Database['public']['Enums']['unit_type'][];
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          created_at?: string;
          destination_city?: string;
          destination_location?: unknown;
          destination_state?: string;
          id?: string;
          notes?: string | null;
          origin_city?: string;
          origin_location?: unknown;
          origin_state?: string;
          unit_types?: Database['public']['Enums']['unit_type'][];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'carrier_routes_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'carrier_routes_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
        ];
      };
      companies: {
        Row: {
          archived_at: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_owner_operator: boolean;
          legal_name: string;
          rfc: string;
          status: Database['public']['Enums']['verification_status'];
          status_reason: string | null;
          type: Database['public']['Enums']['company_type'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_owner_operator?: boolean;
          legal_name: string;
          rfc: string;
          status?: Database['public']['Enums']['verification_status'];
          status_reason?: string | null;
          type: Database['public']['Enums']['company_type'];
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_owner_operator?: boolean;
          legal_name?: string;
          rfc?: string;
          status?: Database['public']['Enums']['verification_status'];
          status_reason?: string | null;
          type?: Database['public']['Enums']['company_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          carrier_company_id: string;
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['conversation_kind'];
          last_message_at: string | null;
          load_id: string;
          negotiation_id: string | null;
          shipper_company_id: string;
          trip_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          carrier_company_id: string;
          created_at?: string;
          id?: string;
          kind: Database['public']['Enums']['conversation_kind'];
          last_message_at?: string | null;
          load_id: string;
          negotiation_id?: string | null;
          shipper_company_id: string;
          trip_id?: string | null;
        };
        Update: {
          carrier_company_id?: string;
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['conversation_kind'];
          last_message_at?: string | null;
          load_id?: string;
          negotiation_id?: string | null;
          shipper_company_id?: string;
          trip_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'conversations_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_load_times';
            referencedColumns: ['load_id'];
          },
          {
            foreignKeyName: 'conversations_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: false;
            referencedRelation: 'loads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_negotiation_fkey';
            columns: ['negotiation_id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'negotiations';
            referencedColumns: ['id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
          },
          {
            foreignKeyName: 'conversations_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'conversations_trip_fkey';
            columns: ['trip_id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: [
              'previous_trip_id',
              'load_id',
              'shipper_company_id',
              'carrier_company_id',
            ];
          },
          {
            foreignKeyName: 'conversations_trip_fkey';
            columns: ['trip_id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['trip_id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
          },
          {
            foreignKeyName: 'conversations_trip_fkey';
            columns: ['trip_id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
          },
        ];
      };
      document_expiry_notices: {
        Row: {
          document_id: string;
          expires_at: string;
          notified_at: string;
          threshold_days: number;
        };
        ComputedFields: never;
        Insert: {
          document_id: string;
          expires_at: string;
          notified_at?: string;
          threshold_days: number;
        };
        Update: {
          document_id?: string;
          expires_at?: string;
          notified_at?: string;
          threshold_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'document_expiry_notices_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          },
        ];
      };
      document_requirements: {
        Row: {
          archived_at: string | null;
          code: string;
          company_type: Database['public']['Enums']['company_type'] | null;
          created_at: string;
          description: string | null;
          id: string;
          is_required: boolean;
          name: string;
          optional_for: Database['public']['Enums']['company_type'][];
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
          shareable_with_shipper: boolean;
          sort_order: number;
          taxpayer_type: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          code: string;
          company_type?: Database['public']['Enums']['company_type'] | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_required?: boolean;
          name: string;
          optional_for?: Database['public']['Enums']['company_type'][];
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry?: boolean;
          shareable_with_shipper?: boolean;
          sort_order?: number;
          taxpayer_type?: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          code?: string;
          company_type?: Database['public']['Enums']['company_type'] | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_required?: boolean;
          name?: string;
          optional_for?: Database['public']['Enums']['company_type'][];
          owner_type?: Database['public']['Enums']['document_owner_type'];
          requires_expiry?: boolean;
          shareable_with_shipper?: boolean;
          sort_order?: number;
          taxpayer_type?: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          archived_at: string | null;
          company_id: string;
          created_at: string;
          expires_at: string | null;
          file_name: string | null;
          id: string;
          mime_type: string | null;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requirement_id: string;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          size_bytes: number | null;
          status: Database['public']['Enums']['verification_status'];
          storage_path: string;
          submitted_by: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          company_id: string;
          created_at?: string;
          expires_at?: string | null;
          file_name?: string | null;
          id?: string;
          mime_type?: string | null;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requirement_id: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          size_bytes?: number | null;
          status?: Database['public']['Enums']['verification_status'];
          storage_path: string;
          submitted_by?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          created_at?: string;
          expires_at?: string | null;
          file_name?: string | null;
          id?: string;
          mime_type?: string | null;
          owner_id?: string;
          owner_type?: Database['public']['Enums']['document_owner_type'];
          requirement_id?: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          size_bytes?: number | null;
          status?: Database['public']['Enums']['verification_status'];
          storage_path?: string;
          submitted_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'documents_requirement_id_fkey';
            columns: ['requirement_id'];
            isOneToOne: false;
            referencedRelation: 'document_requirements';
            referencedColumns: ['id'];
          },
        ];
      };
      incidents: {
        Row: {
          created_at: string;
          description: string;
          device_occurred_at: string | null;
          id: string;
          kind: Database['public']['Enums']['incident_kind'];
          latitude: number | null;
          location: unknown;
          longitude: number | null;
          occurred_at: string;
          reported_by: string | null;
          reporter_role: Database['public']['Enums']['user_role'];
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database['public']['Enums']['incident_status'];
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description: string;
          device_occurred_at?: string | null;
          id?: string;
          kind: Database['public']['Enums']['incident_kind'];
          latitude?: number | null;
          location?: never;
          longitude?: number | null;
          occurred_at: string;
          reported_by?: string | null;
          reporter_role: Database['public']['Enums']['user_role'];
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['incident_status'];
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          device_occurred_at?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['incident_kind'];
          latitude?: number | null;
          location?: never;
          longitude?: number | null;
          occurred_at?: string;
          reported_by?: string | null;
          reporter_role?: Database['public']['Enums']['user_role'];
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['incident_status'];
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'incidents_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['previous_trip_id'];
          },
          {
            foreignKeyName: 'incidents_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['trip_id'];
          },
          {
            foreignKeyName: 'incidents_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          business_unit_ids: string[];
          company_id: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          invitee_name: string | null;
          kind: Database['public']['Enums']['invitation_kind'];
          operator_id: string | null;
          revoked_at: string | null;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          business_unit_ids: string[];
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          invitee_name?: string | null;
          kind: Database['public']['Enums']['invitation_kind'];
          operator_id?: string | null;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          business_unit_ids?: string[];
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          invitee_name?: string | null;
          kind?: Database['public']['Enums']['invitation_kind'];
          operator_id?: string | null;
          revoked_at?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'invitations_operator_fkey';
            columns: ['company_id', 'operator_id'];
            isOneToOne: false;
            referencedRelation: 'operators';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
      license_unit_compatibility: {
        Row: {
          allowed: boolean;
          id: string;
          license_type: Database['public']['Enums']['license_type'];
          updated_at: string;
          vehicle_kind: Database['public']['Enums']['vehicle_kind'];
        };
        ComputedFields: never;
        Insert: {
          allowed?: boolean;
          id?: string;
          license_type: Database['public']['Enums']['license_type'];
          updated_at?: string;
          vehicle_kind: Database['public']['Enums']['vehicle_kind'];
        };
        Update: {
          allowed?: boolean;
          id?: string;
          license_type?: Database['public']['Enums']['license_type'];
          updated_at?: string;
          vehicle_kind?: Database['public']['Enums']['vehicle_kind'];
        };
        Relationships: [];
      };
      loads: {
        Row: {
          accepted_offer_id: string | null;
          agreed_price_cents: number | null;
          archived_at: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cargo_type: Database['public']['Enums']['cargo_type'];
          carrier_company_id: string | null;
          contracted_at: string | null;
          created_at: string;
          created_by: string | null;
          delivery_window_end: string;
          delivery_window_start: string;
          description: string;
          destination_address: string;
          destination_city: string;
          destination_lat: number;
          destination_lng: number;
          destination_location: unknown;
          destination_place_id: string | null;
          destination_state: string;
          id: string;
          notes: string | null;
          origin_address: string;
          origin_city: string;
          origin_lat: number;
          origin_lng: number;
          origin_location: unknown;
          origin_place_id: string | null;
          origin_state: string;
          pickup_window_end: string;
          pickup_window_start: string;
          proposed_price_cents: number;
          published_at: string | null;
          shipper_company_id: string;
          special_requirements: Database['public']['Enums']['special_requirement'][];
          status: Database['public']['Enums']['load_status'];
          unit_type: Database['public']['Enums']['unit_type'];
          updated_at: string;
          volume_m3: number | null;
          weight_kg: number;
          share_link_public_load: Json | null;
        };
        ComputedFields: 'share_link_public_load';
        Insert: {
          accepted_offer_id?: string | null;
          agreed_price_cents?: number | null;
          archived_at?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cargo_type: Database['public']['Enums']['cargo_type'];
          carrier_company_id?: string | null;
          contracted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivery_window_end: string;
          delivery_window_start: string;
          description: string;
          destination_address: string;
          destination_city: string;
          destination_lat: number;
          destination_lng: number;
          destination_location?: never;
          destination_place_id?: string | null;
          destination_state: string;
          id?: string;
          notes?: string | null;
          origin_address: string;
          origin_city: string;
          origin_lat: number;
          origin_lng: number;
          origin_location?: never;
          origin_place_id?: string | null;
          origin_state: string;
          pickup_window_end: string;
          pickup_window_start: string;
          proposed_price_cents: number;
          published_at?: string | null;
          shipper_company_id: string;
          special_requirements?: Database['public']['Enums']['special_requirement'][];
          status?: Database['public']['Enums']['load_status'];
          unit_type: Database['public']['Enums']['unit_type'];
          updated_at?: string;
          volume_m3?: number | null;
          weight_kg: number;
        };
        Update: {
          accepted_offer_id?: string | null;
          agreed_price_cents?: number | null;
          archived_at?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cargo_type?: Database['public']['Enums']['cargo_type'];
          carrier_company_id?: string | null;
          contracted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivery_window_end?: string;
          delivery_window_start?: string;
          description?: string;
          destination_address?: string;
          destination_city?: string;
          destination_lat?: number;
          destination_lng?: number;
          destination_location?: never;
          destination_place_id?: string | null;
          destination_state?: string;
          id?: string;
          notes?: string | null;
          origin_address?: string;
          origin_city?: string;
          origin_lat?: number;
          origin_lng?: number;
          origin_location?: never;
          origin_place_id?: string | null;
          origin_state?: string;
          pickup_window_end?: string;
          pickup_window_start?: string;
          proposed_price_cents?: number;
          published_at?: string | null;
          shipper_company_id?: string;
          special_requirements?: Database['public']['Enums']['special_requirement'][];
          status?: Database['public']['Enums']['load_status'];
          unit_type?: Database['public']['Enums']['unit_type'];
          updated_at?: string;
          volume_m3?: number | null;
          weight_kg?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'loads_accepted_offer_fkey';
            columns: ['accepted_offer_id'];
            isOneToOne: false;
            referencedRelation: 'offers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'loads_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'loads_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'loads_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'loads_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
        ];
      };
      location_consents: {
        Row: {
          accepted_at: string;
          id: string;
          platform: string;
          policy_version: string;
          revoked_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string;
          id?: string;
          platform: string;
          policy_version: string;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          id?: string;
          platform?: string;
          policy_version?: string;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'location_consents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_reads: {
        Row: {
          conversation_id: string;
          last_read_at: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          conversation_id: string;
          last_read_at: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          last_read_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reads_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          attachments: NonNullable<Json>;
          body: string | null;
          client_message_id: string | null;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_id: string | null;
          sender_role: Database['public']['Enums']['user_role'];
        };
        ComputedFields: never;
        Insert: {
          attachments?: NonNullable<Json>;
          body?: string | null;
          client_message_id?: string | null;
          conversation_id: string;
          created_at?: string;
          id?: string;
          sender_id?: string | null;
          sender_role: Database['public']['Enums']['user_role'];
        };
        Update: {
          attachments?: NonNullable<Json>;
          body?: string | null;
          client_message_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string | null;
          sender_role?: Database['public']['Enums']['user_role'];
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      negotiations: {
        Row: {
          business_unit_id: string;
          carrier_company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          load_id: string;
          shipper_company_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          business_unit_id: string;
          carrier_company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          load_id: string;
          shipper_company_id: string;
          updated_at?: string;
        };
        Update: {
          business_unit_id?: string;
          carrier_company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          load_id?: string;
          shipper_company_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'negotiations_business_unit_fkey';
            columns: ['carrier_company_id', 'business_unit_id'];
            isOneToOne: false;
            referencedRelation: 'business_units';
            referencedColumns: ['company_id', 'id'];
          },
          {
            foreignKeyName: 'negotiations_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'negotiations_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'negotiations_load_fkey';
            columns: ['load_id', 'shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_load_times';
            referencedColumns: ['load_id', 'shipper_company_id'];
          },
          {
            foreignKeyName: 'negotiations_load_fkey';
            columns: ['load_id', 'shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'loads';
            referencedColumns: ['id', 'shipper_company_id'];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          data: NonNullable<Json>;
          dispatch_attempts: number;
          dispatch_error: string | null;
          dispatch_retry_at: string | null;
          dispatched_at: string | null;
          email_state: string | null;
          id: string;
          push_state: string | null;
          read_at: string | null;
          type: Database['public']['Enums']['notification_type'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          data?: NonNullable<Json>;
          dispatch_attempts?: number;
          dispatch_error?: string | null;
          dispatch_retry_at?: string | null;
          dispatched_at?: string | null;
          email_state?: string | null;
          id?: string;
          push_state?: string | null;
          read_at?: string | null;
          type: Database['public']['Enums']['notification_type'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          data?: NonNullable<Json>;
          dispatch_attempts?: number;
          dispatch_error?: string | null;
          dispatch_retry_at?: string | null;
          dispatched_at?: string | null;
          email_state?: string | null;
          id?: string;
          push_state?: string | null;
          read_at?: string | null;
          type?: Database['public']['Enums']['notification_type'];
          user_id?: string;
        };
        Relationships: [];
      };
      offers: {
        Row: {
          amount_cents: number;
          carrier_company_id: string;
          conditions: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          load_id: string;
          negotiation_id: string;
          parent_offer_id: string | null;
          responded_at: string | null;
          responded_by: string | null;
          shipper_company_id: string;
          side: Database['public']['Enums']['offer_side'];
          status: Database['public']['Enums']['offer_status'];
          status_reason: string | null;
          vehicle_id: string | null;
          apply_offer_acceptance: string | null;
        };
        ComputedFields: 'apply_offer_acceptance';
        Insert: {
          amount_cents: number;
          carrier_company_id: string;
          conditions?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          load_id: string;
          negotiation_id: string;
          parent_offer_id?: string | null;
          responded_at?: string | null;
          responded_by?: string | null;
          shipper_company_id: string;
          side: Database['public']['Enums']['offer_side'];
          status?: Database['public']['Enums']['offer_status'];
          status_reason?: string | null;
          vehicle_id?: string | null;
        };
        Update: {
          amount_cents?: number;
          carrier_company_id?: string;
          conditions?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          load_id?: string;
          negotiation_id?: string;
          parent_offer_id?: string | null;
          responded_at?: string | null;
          responded_by?: string | null;
          shipper_company_id?: string;
          side?: Database['public']['Enums']['offer_side'];
          status?: Database['public']['Enums']['offer_status'];
          status_reason?: string | null;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'offers_negotiation_fkey';
            columns: ['negotiation_id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'negotiations';
            referencedColumns: ['id', 'load_id', 'shipper_company_id', 'carrier_company_id'];
          },
          {
            foreignKeyName: 'offers_parent_offer_id_fkey';
            columns: ['parent_offer_id'];
            isOneToOne: false;
            referencedRelation: 'offers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offers_vehicle_fkey';
            columns: ['carrier_company_id', 'vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
      operator_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          code_hash: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          email: string;
          expires_at: string;
          id: string;
          operator_id: string;
          revoked_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          code_hash: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          email: string;
          expires_at: string;
          id?: string;
          operator_id: string;
          revoked_at?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          code_hash?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          operator_id?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'operator_invitations_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operator_invitations_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'operator_invitations_operator_fkey';
            columns: ['company_id', 'operator_id'];
            isOneToOne: false;
            referencedRelation: 'operators';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
      operators: {
        Row: {
          archived_at: string | null;
          business_unit_id: string;
          company_id: string;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          license_expires_on: string | null;
          license_number: string | null;
          license_type: Database['public']['Enums']['license_type'] | null;
          phone: string | null;
          profile_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          business_unit_id: string;
          company_id: string;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          license_expires_on?: string | null;
          license_number?: string | null;
          license_type?: Database['public']['Enums']['license_type'] | null;
          phone?: string | null;
          profile_id?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          business_unit_id?: string;
          company_id?: string;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          license_expires_on?: string | null;
          license_number?: string | null;
          license_type?: Database['public']['Enums']['license_type'] | null;
          phone?: string | null;
          profile_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operators_business_unit_fkey';
            columns: ['company_id', 'business_unit_id'];
            isOneToOne: false;
            referencedRelation: 'business_units';
            referencedColumns: ['company_id', 'id'];
          },
          {
            foreignKeyName: 'operators_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operators_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'operators_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      product_events: {
        Row: {
          company_id: string | null;
          id: string;
          load_id: string | null;
          name: Database['public']['Enums']['product_event_name'];
          occurred_at: string;
          properties: NonNullable<Json>;
          user_id: string | null;
          user_role: Database['public']['Enums']['user_role'] | null;
        };
        ComputedFields: never;
        Insert: {
          company_id?: string | null;
          id?: string;
          load_id?: string | null;
          name: Database['public']['Enums']['product_event_name'];
          occurred_at?: string;
          properties?: NonNullable<Json>;
          user_id?: string | null;
          user_role?: Database['public']['Enums']['user_role'] | null;
        };
        Update: {
          company_id?: string | null;
          id?: string;
          load_id?: string | null;
          name?: Database['public']['Enums']['product_event_name'];
          occurred_at?: string;
          properties?: NonNullable<Json>;
          user_id?: string | null;
          user_role?: Database['public']['Enums']['user_role'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'product_events_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_events_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'product_events_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_load_times';
            referencedColumns: ['load_id'];
          },
          {
            foreignKeyName: 'product_events_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: false;
            referencedRelation: 'loads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          company_id: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company_id?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          role: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
        ];
      };
      push_tokens: {
        Row: {
          created_at: string;
          id: string;
          last_seen_at: string;
          platform: Database['public']['Enums']['push_platform'];
          token: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          last_seen_at?: string;
          platform: Database['public']['Enums']['push_platform'];
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_seen_at?: string;
          platform?: Database['public']['Enums']['push_platform'];
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rate_limit_counters: {
        Row: {
          bucket: string;
          hits: number;
          subject: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          bucket: string;
          hits: number;
          subject: string;
          window_start: string;
        };
        Update: {
          bucket?: string;
          hits?: number;
          subject?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      route_distance_cache: {
        Row: {
          destination_lat: number;
          destination_lng: number;
          distance_km: number;
          duration_minutes: number;
          fetched_at: string;
          origin_lat: number;
          origin_lng: number;
        };
        ComputedFields: never;
        Insert: {
          destination_lat: number;
          destination_lng: number;
          distance_km: number;
          duration_minutes: number;
          fetched_at?: string;
          origin_lat: number;
          origin_lng: number;
        };
        Update: {
          destination_lat?: number;
          destination_lng?: number;
          distance_km?: number;
          duration_minutes?: number;
          fetched_at?: string;
          origin_lat?: number;
          origin_lng?: number;
        };
        Relationships: [];
      };
      share_links: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          kind: Database['public']['Enums']['share_link_kind'];
          last_viewed_at: string | null;
          load_id: string | null;
          revoked_at: string | null;
          token_hash: string;
          trip_id: string | null;
          view_count: number;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          kind: Database['public']['Enums']['share_link_kind'];
          last_viewed_at?: string | null;
          load_id?: string | null;
          revoked_at?: string | null;
          token_hash: string;
          trip_id?: string | null;
          view_count?: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['share_link_kind'];
          last_viewed_at?: string | null;
          load_id?: string | null;
          revoked_at?: string | null;
          token_hash?: string;
          trip_id?: string | null;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'share_links_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'share_links_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'share_links_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_load_times';
            referencedColumns: ['load_id'];
          },
          {
            foreignKeyName: 'share_links_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: false;
            referencedRelation: 'loads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'share_links_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['previous_trip_id'];
          },
          {
            foreignKeyName: 'share_links_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['trip_id'];
          },
          {
            foreignKeyName: 'share_links_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      trip_document_requirements: {
        Row: {
          blocks_departure: boolean;
          is_required: boolean;
          kind: Database['public']['Enums']['trip_document_kind'];
          sort_order: number;
          stage: Database['public']['Enums']['trip_document_stage'];
          updated_at: string;
          uploader_sides: Database['public']['Enums']['offer_side'][];
        };
        ComputedFields: never;
        Insert: {
          blocks_departure?: boolean;
          is_required?: boolean;
          kind: Database['public']['Enums']['trip_document_kind'];
          sort_order?: number;
          stage: Database['public']['Enums']['trip_document_stage'];
          updated_at?: string;
          uploader_sides: Database['public']['Enums']['offer_side'][];
        };
        Update: {
          blocks_departure?: boolean;
          is_required?: boolean;
          kind?: Database['public']['Enums']['trip_document_kind'];
          sort_order?: number;
          stage?: Database['public']['Enums']['trip_document_stage'];
          updated_at?: string;
          uploader_sides?: Database['public']['Enums']['offer_side'][];
        };
        Relationships: [];
      };
      trip_documents: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          kind: Database['public']['Enums']['trip_document_kind'];
          mime_type: string | null;
          size_bytes: number | null;
          storage_path: string;
          trip_id: string;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          kind: Database['public']['Enums']['trip_document_kind'];
          mime_type?: string | null;
          size_bytes?: number | null;
          storage_path: string;
          trip_id: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          kind?: Database['public']['Enums']['trip_document_kind'];
          mime_type?: string | null;
          size_bytes?: number | null;
          storage_path?: string;
          trip_id?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trip_documents_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['previous_trip_id'];
          },
          {
            foreignKeyName: 'trip_documents_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['trip_id'];
          },
          {
            foreignKeyName: 'trip_documents_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      trip_events: {
        Row: {
          accuracy_m: number | null;
          actor_id: string | null;
          actor_role: Database['public']['Enums']['user_role'] | null;
          client_event_id: string | null;
          estimated_unload_end_at: string | null;
          event_type: Database['public']['Enums']['trip_event_type'];
          from_status: Database['public']['Enums']['trip_status'] | null;
          id: string;
          incident_id: string | null;
          latitude: number | null;
          location: unknown;
          longitude: number | null;
          notes: string | null;
          occurred_at: string;
          received_by_name: string | null;
          recorded_at: string;
          to_status: Database['public']['Enums']['trip_status'] | null;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          accuracy_m?: number | null;
          actor_id?: string | null;
          actor_role?: Database['public']['Enums']['user_role'] | null;
          client_event_id?: string | null;
          estimated_unload_end_at?: string | null;
          event_type: Database['public']['Enums']['trip_event_type'];
          from_status?: Database['public']['Enums']['trip_status'] | null;
          id?: string;
          incident_id?: string | null;
          latitude?: number | null;
          location?: never;
          longitude?: number | null;
          notes?: string | null;
          occurred_at: string;
          received_by_name?: string | null;
          recorded_at?: string;
          to_status?: Database['public']['Enums']['trip_status'] | null;
          trip_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          actor_id?: string | null;
          actor_role?: Database['public']['Enums']['user_role'] | null;
          client_event_id?: string | null;
          estimated_unload_end_at?: string | null;
          event_type?: Database['public']['Enums']['trip_event_type'];
          from_status?: Database['public']['Enums']['trip_status'] | null;
          id?: string;
          incident_id?: string | null;
          latitude?: number | null;
          location?: never;
          longitude?: number | null;
          notes?: string | null;
          occurred_at?: string;
          received_by_name?: string | null;
          recorded_at?: string;
          to_status?: Database['public']['Enums']['trip_status'] | null;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'trip_events_incident_fkey';
            columns: ['incident_id', 'trip_id'];
            isOneToOne: false;
            referencedRelation: 'incidents';
            referencedColumns: ['id', 'trip_id'];
          },
          {
            foreignKeyName: 'trip_events_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['previous_trip_id'];
          },
          {
            foreignKeyName: 'trip_events_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['trip_id'];
          },
          {
            foreignKeyName: 'trip_events_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      trip_evidence: {
        Row: {
          captured_at: string;
          created_at: string;
          device_captured_at: string | null;
          id: string;
          incident_id: string | null;
          latitude: number | null;
          location: unknown;
          longitude: number | null;
          mime_type: string | null;
          sha256: string;
          size_bytes: number | null;
          stage: Database['public']['Enums']['evidence_stage'];
          storage_path: string;
          trip_id: string;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          captured_at: string;
          created_at?: string;
          device_captured_at?: string | null;
          id?: string;
          incident_id?: string | null;
          latitude?: number | null;
          location?: never;
          longitude?: number | null;
          mime_type?: string | null;
          sha256: string;
          size_bytes?: number | null;
          stage: Database['public']['Enums']['evidence_stage'];
          storage_path: string;
          trip_id: string;
          uploaded_by?: string | null;
        };
        Update: {
          captured_at?: string;
          created_at?: string;
          device_captured_at?: string | null;
          id?: string;
          incident_id?: string | null;
          latitude?: number | null;
          location?: never;
          longitude?: number | null;
          mime_type?: string | null;
          sha256?: string;
          size_bytes?: number | null;
          stage?: Database['public']['Enums']['evidence_stage'];
          storage_path?: string;
          trip_id?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trip_evidence_incident_fkey';
            columns: ['incident_id', 'trip_id'];
            isOneToOne: false;
            referencedRelation: 'incidents';
            referencedColumns: ['id', 'trip_id'];
          },
          {
            foreignKeyName: 'trip_evidence_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['previous_trip_id'];
          },
          {
            foreignKeyName: 'trip_evidence_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['trip_id'];
          },
          {
            foreignKeyName: 'trip_evidence_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      trip_evidence_requirements: {
        Row: {
          id: string;
          min_photos: number;
          stage: Database['public']['Enums']['evidence_stage'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          min_photos: number;
          stage: Database['public']['Enums']['evidence_stage'];
          updated_at?: string;
        };
        Update: {
          id?: string;
          min_photos?: number;
          stage?: Database['public']['Enums']['evidence_stage'];
          updated_at?: string;
        };
        Relationships: [];
      };
      trip_locations: {
        Row: {
          accuracy_m: number | null;
          heading_deg: number | null;
          id: number;
          latitude: number;
          location: unknown;
          longitude: number;
          received_at: string;
          recorded_at: string;
          speed_mps: number | null;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          accuracy_m?: number | null;
          heading_deg?: number | null;
          id?: never;
          latitude: number;
          location?: never;
          longitude: number;
          received_at?: string;
          recorded_at: string;
          speed_mps?: number | null;
          trip_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          heading_deg?: number | null;
          id?: never;
          latitude?: number;
          location?: never;
          longitude?: number;
          received_at?: string;
          recorded_at?: string;
          speed_mps?: number | null;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'trip_locations_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['previous_trip_id'];
          },
          {
            foreignKeyName: 'trip_locations_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_trip_metrics';
            referencedColumns: ['trip_id'];
          },
          {
            foreignKeyName: 'trip_locations_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      trips: {
        Row: {
          assigned_at: string | null;
          business_unit_id: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          carrier_company_id: string;
          closed_at: string | null;
          created_at: string;
          delivered_at: string | null;
          estimated_unload_end_at: string | null;
          id: string;
          load_id: string;
          offer_id: string;
          operator_id: string | null;
          shipper_company_id: string;
          started_at: string | null;
          status: Database['public']['Enums']['trip_status'];
          updated_at: string;
          vehicle_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          assigned_at?: string | null;
          business_unit_id: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          carrier_company_id: string;
          closed_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          estimated_unload_end_at?: string | null;
          id?: string;
          load_id: string;
          offer_id: string;
          operator_id?: string | null;
          shipper_company_id: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['trip_status'];
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          assigned_at?: string | null;
          business_unit_id?: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          carrier_company_id?: string;
          closed_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          estimated_unload_end_at?: string | null;
          id?: string;
          load_id?: string;
          offer_id?: string;
          operator_id?: string | null;
          shipper_company_id?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['trip_status'];
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trips_business_unit_fkey';
            columns: ['carrier_company_id', 'business_unit_id'];
            isOneToOne: false;
            referencedRelation: 'business_units';
            referencedColumns: ['company_id', 'id'];
          },
          {
            foreignKeyName: 'trips_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trips_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'trips_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: true;
            referencedRelation: 'kpi_load_times';
            referencedColumns: ['load_id'];
          },
          {
            foreignKeyName: 'trips_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: true;
            referencedRelation: 'loads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trips_offer_id_fkey';
            columns: ['offer_id'];
            isOneToOne: true;
            referencedRelation: 'offers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trips_operator_fkey';
            columns: ['carrier_company_id', 'operator_id'];
            isOneToOne: false;
            referencedRelation: 'operators';
            referencedColumns: ['company_id', 'id'];
          },
          {
            foreignKeyName: 'trips_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trips_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'trips_vehicle_fkey';
            columns: ['carrier_company_id', 'vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
      vehicle_availability: {
        Row: {
          archived_at: string | null;
          available_from: string;
          city: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          ended_by_trip_id: string | null;
          id: string;
          location: unknown;
          restored_by_trip_id: string | null;
          restored_from_id: string | null;
          source: Database['public']['Enums']['availability_source'];
          state: string;
          vehicle_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          available_from: string;
          city: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          ended_by_trip_id?: string | null;
          id?: string;
          location: unknown;
          restored_by_trip_id?: string | null;
          restored_from_id?: string | null;
          source?: Database['public']['Enums']['availability_source'];
          state: string;
          vehicle_id: string;
        };
        Update: {
          archived_at?: string | null;
          available_from?: string;
          city?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          ended_by_trip_id?: string | null;
          id?: string;
          location?: unknown;
          restored_by_trip_id?: string | null;
          restored_from_id?: string | null;
          source?: Database['public']['Enums']['availability_source'];
          state?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicle_availability_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicle_availability_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'vehicle_availability_vehicle_fkey';
            columns: ['company_id', 'vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
      vehicles: {
        Row: {
          archived_at: string | null;
          business_unit_id: string;
          capacity_kg: number | null;
          capacity_m3: number | null;
          company_id: string;
          created_at: string;
          current_operator_id: string | null;
          features: Database['public']['Enums']['special_requirement'][];
          fleet_number: string | null;
          id: string;
          kind: Database['public']['Enums']['vehicle_kind'];
          model_year: number | null;
          plate: string;
          unit_type: Database['public']['Enums']['unit_type'] | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          business_unit_id: string;
          capacity_kg?: number | null;
          capacity_m3?: number | null;
          company_id: string;
          created_at?: string;
          current_operator_id?: string | null;
          features?: Database['public']['Enums']['special_requirement'][];
          fleet_number?: string | null;
          id?: string;
          kind: Database['public']['Enums']['vehicle_kind'];
          model_year?: number | null;
          plate: string;
          unit_type?: Database['public']['Enums']['unit_type'] | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          business_unit_id?: string;
          capacity_kg?: number | null;
          capacity_m3?: number | null;
          company_id?: string;
          created_at?: string;
          current_operator_id?: string | null;
          features?: Database['public']['Enums']['special_requirement'][];
          fleet_number?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['vehicle_kind'];
          model_year?: number | null;
          plate?: string;
          unit_type?: Database['public']['Enums']['unit_type'] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicles_business_unit_fkey';
            columns: ['company_id', 'business_unit_id'];
            isOneToOne: false;
            referencedRelation: 'business_units';
            referencedColumns: ['company_id', 'id'];
          },
          {
            foreignKeyName: 'vehicles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'vehicles_current_operator_fkey';
            columns: ['company_id', 'current_operator_id'];
            isOneToOne: false;
            referencedRelation: 'operators';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
    };
    Views: {
      kpi_carrier_onboarding: {
        Row: {
          approved_at: string | null;
          company_id: string | null;
          legal_name: string | null;
          minutes_to_approval: number | null;
          registered_at: string | null;
          status: Database['public']['Enums']['verification_status'] | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      kpi_load_times: {
        Row: {
          contracted_at: string | null;
          first_offer_at: string | null;
          load_id: string | null;
          minutes_to_contract: number | null;
          minutes_to_first_offer: number | null;
          published_at: string | null;
          shipper_company_id: string | null;
          status: Database['public']['Enums']['load_status'] | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'loads_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'loads_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
        ];
      };
      kpi_pilot_summary: {
        Row: {
          avg_abs_unload_error_minutes: number | null;
          avg_avoided_empty_km: number | null;
          avg_empty_km: number | null;
          loads_published: number | null;
          median_minutes_to_carrier_approval: number | null;
          median_minutes_to_contract: number | null;
          median_minutes_to_first_offer: number | null;
          offers_total: number | null;
          return_trips: number | null;
          total_avoided_empty_km: number | null;
          trips_closed: number | null;
          trips_total: number | null;
          unload_estimates_measured: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      kpi_trip_metrics: {
        Row: {
          avoided_empty_km: number | null;
          carrier_company_id: string | null;
          created_at: string | null;
          empty_km: number | null;
          is_return_trip: boolean | null;
          load_id: string | null;
          previous_trip_id: string | null;
          shipper_company_id: string | null;
          status: Database['public']['Enums']['trip_status'] | null;
          trip_id: string | null;
          unload_estimate_error_minutes: number | null;
          unload_estimated_end_at: string | null;
          unload_finished_at: string | null;
          vehicle_id: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'trips_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trips_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'trips_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: true;
            referencedRelation: 'kpi_load_times';
            referencedColumns: ['load_id'];
          },
          {
            foreignKeyName: 'trips_load_id_fkey';
            columns: ['load_id'];
            isOneToOne: true;
            referencedRelation: 'loads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trips_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trips_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'kpi_carrier_onboarding';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'trips_vehicle_fkey';
            columns: ['carrier_company_id', 'vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
    };
    Functions: {
      accept_coordinator_invitation: { Args: { p_token: string }; Returns: string };
      accept_offer: { Args: { p_offer_id: string }; Returns: string };
      accept_operator_invitation: { Args: { p_code: string }; Returns: string };
      add_trip_document: {
        Args: {
          p_file_name: string;
          p_kind: Database['public']['Enums']['trip_document_kind'];
          p_storage_path: string;
          p_trip_id: string;
        };
        Returns: string;
      };
      add_trip_evidence: {
        Args: {
          p_captured_at: string;
          p_incident_client_event_id?: string;
          p_incident_id?: string;
          p_latitude?: number;
          p_longitude?: number;
          p_sha256: string;
          p_stage: Database['public']['Enums']['evidence_stage'];
          p_storage_path: string;
          p_trip_id: string;
        };
        Returns: string;
      };
      admin_accept_offer: { Args: { p_offer_id: string }; Returns: string };
      admin_create_offer: {
        Args: {
          p_accept?: boolean;
          p_amount_cents: number;
          p_carrier_company_id: string;
          p_conditions?: string;
          p_load_id: string;
          p_vehicle_id?: string;
        };
        Returns: string;
      };
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string };
        Returns: {
          company_id: string;
          company_legal_name: string;
          company_rfc: string;
          company_status: Database['public']['Enums']['verification_status'];
          company_type: Database['public']['Enums']['company_type'];
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          last_sign_in_at: string;
          role: Database['public']['Enums']['user_role'];
          total_count: number;
        }[];
      };
      apply_load_payload: {
        Args: {
          p_load: Omit<
            Database['public']['Tables']['loads']['Row'],
            Database['public']['Tables']['loads']['ComputedFields']
          >;
          p_payload: Json;
        };
        Returns: {
          accepted_offer_id: string | null;
          agreed_price_cents: number | null;
          archived_at: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cargo_type: Database['public']['Enums']['cargo_type'];
          carrier_company_id: string | null;
          contracted_at: string | null;
          created_at: string;
          created_by: string | null;
          delivery_window_end: string;
          delivery_window_start: string;
          description: string;
          destination_address: string;
          destination_city: string;
          destination_lat: number;
          destination_lng: number;
          destination_location: unknown;
          destination_place_id: string | null;
          destination_state: string;
          id: string;
          notes: string | null;
          origin_address: string;
          origin_city: string;
          origin_lat: number;
          origin_lng: number;
          origin_location: unknown;
          origin_place_id: string | null;
          origin_state: string;
          pickup_window_end: string;
          pickup_window_start: string;
          proposed_price_cents: number;
          published_at: string | null;
          shipper_company_id: string;
          special_requirements: Database['public']['Enums']['special_requirement'][];
          status: Database['public']['Enums']['load_status'];
          unit_type: Database['public']['Enums']['unit_type'];
          updated_at: string;
          volume_m3: number | null;
          weight_kg: number;
        };
        SetofOptions: {
          from: '*';
          to: 'loads';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      apply_offer_acceptance: {
        Args: {
          p_offer: Omit<
            Database['public']['Tables']['offers']['Row'],
            Database['public']['Tables']['offers']['ComputedFields']
          >;
        };
        Returns: string;
      };
      assert_coordinates: { Args: { p_lat: number; p_lng: number }; Returns: undefined };
      assert_pickup_open: { Args: { p_load_id: string }; Returns: undefined };
      assert_trip_event_order: {
        Args: {
          p_at: string;
          p_trip: Omit<
            Database['public']['Tables']['trips']['Row'],
            Database['public']['Tables']['trips']['ComputedFields']
          >;
        };
        Returns: undefined;
      };
      assert_trip_timestamp: {
        Args: {
          p_at: string;
          p_trip: Omit<
            Database['public']['Tables']['trips']['Row'],
            Database['public']['Tables']['trips']['ComputedFields']
          >;
          p_what: string;
        };
        Returns: undefined;
      };
      assert_vehicle_in_unit: {
        Args: { p_business_unit_id: string; p_vehicle_id: string };
        Returns: undefined;
      };
      assign_trip: {
        Args: { p_operator_id: string; p_trip_id: string; p_vehicle_id: string };
        Returns: undefined;
      };
      auth_business_unit_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      auth_carrier_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_fleet_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_is_manager: { Args: Record<PropertyKey, never>; Returns: boolean };
      auth_operator_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
      auth_shipper_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      can_operate_unit: { Args: { p_unit_id: string }; Returns: boolean };
      cancel_load: { Args: { p_load_id: string; p_reason?: string }; Returns: undefined };
      cancel_trip: { Args: { p_reason: string; p_trip_id: string }; Returns: undefined };
      check_offer_fields: {
        Args: {
          p_amount_cents: number;
          p_carrier_company_id: string;
          p_conditions: string;
          p_side: Database['public']['Enums']['offer_side'];
          p_vehicle_id: string;
        };
        Returns: undefined;
      };
      claim_notifications: {
        Args: { p_lease_seconds?: number; p_limit?: number };
        Returns: {
          attempt: number;
          created_at: string;
          data: Json;
          email: string;
          email_pending: boolean;
          id: string;
          push_pending: boolean;
          push_tokens: string[];
          role: Database['public']['Enums']['user_role'];
          type: Database['public']['Enums']['notification_type'];
          user_id: string;
        }[];
      };
      clear_vehicle_availability: { Args: { p_vehicle_id: string }; Returns: undefined };
      company_missing_requirements: {
        Args: { p_company_id: string };
        Returns: {
          archived_at: string | null;
          code: string;
          company_type: Database['public']['Enums']['company_type'] | null;
          created_at: string;
          description: string | null;
          id: string;
          is_required: boolean;
          name: string;
          optional_for: Database['public']['Enums']['company_type'][];
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
          shareable_with_shipper: boolean;
          sort_order: number;
          taxpayer_type: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_requirements';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      confirm_delivery: {
        Args: { p_client_event_id?: string; p_notes?: string; p_trip_id: string };
        Returns: undefined;
      };
      consume_rate_limit: { Args: { p_bucket: string }; Returns: number };
      consume_service_rate_limit: {
        Args: { p_bucket: string; p_subject: string };
        Returns: number;
      };
      conversation_business_unit_id: { Args: { p_conversation_id: string }; Returns: string };
      coordinator_runs_document_owner: {
        Args: {
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
        };
        Returns: boolean;
      };
      counter_offer: {
        Args: {
          p_amount_cents: number;
          p_conditions?: string;
          p_offer_id: string;
          p_vehicle_id?: string;
        };
        Returns: string;
      };
      create_company: {
        Args: {
          p_contact_email?: string;
          p_contact_name?: string;
          p_contact_phone?: string;
          p_legal_name: string;
          p_rfc: string;
        };
        Returns: string;
      };
      create_invitation: {
        Args: {
          p_business_unit_ids: string[];
          p_invitee_name?: string;
          p_kind: Database['public']['Enums']['invitation_kind'];
          p_operator_id?: string;
          p_valid_for_hours?: number;
        };
        Returns: {
          expires_at: string;
          invitation_id: string;
          token: string;
        }[];
      };
      create_load: { Args: { p_load: Json }; Returns: string };
      create_operator_invitation: {
        Args: { p_operator_id: string; p_valid_for_hours?: number };
        Returns: {
          code: string;
          expires_at: string;
          invitation_id: string;
        }[];
      };
      create_share_link: {
        Args: {
          p_kind: Database['public']['Enums']['share_link_kind'];
          p_load_id?: string;
          p_trip_id?: string;
          p_valid_for_hours?: number;
        };
        Returns: {
          expires_at: string;
          id: string;
          token: string;
        }[];
      };
      create_trip_for_accepted_offer: { Args: { p_offer_id: string }; Returns: string };
      delete_push_tokens: { Args: { p_tokens: string[] }; Returns: number };
      device_time_ahead: { Args: { p_at: string }; Returns: boolean };
      document_owner_company_id: {
        Args: {
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
        };
        Returns: string;
      };
      expire_stale_loads: { Args: Record<PropertyKey, never>; Returns: number };
      get_route_distances: {
        Args: { p_legs: Json };
        Returns: {
          destination_lat: number;
          destination_lng: number;
          distance_km: number;
          duration_minutes: number;
          origin_lat: number;
          origin_lng: number;
        }[];
      };
      has_location_consent: { Args: Record<PropertyKey, never>; Returns: boolean };
      invitation_preview: {
        Args: { p_token: string };
        Returns: {
          business_unit_names: string[];
          company_legal_name: string;
          expires_at: string;
          invitee_name: string;
          inviter_name: string;
          kind: Database['public']['Enums']['invitation_kind'];
        }[];
      };
      invitation_token_hash: { Args: { p_token: string }; Returns: string };
      invoke_notification_dispatcher: { Args: Record<PropertyKey, never>; Returns: number };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_company_approved: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_conversation_participant: { Args: { p_conversation_id: string }; Returns: boolean };
      load_negotiation_carriers: {
        Args: { p_load_id: string };
        Returns: {
          carrier_company_id: string;
          carrier_legal_name: string;
          carrier_status: Database['public']['Enums']['verification_status'];
          conversation_id: string;
          negotiation_id: string;
          unread_messages: number;
        }[];
      };
      load_offer_vehicles: {
        Args: { p_load_id: string };
        Returns: {
          capacity_kg: number;
          capacity_m3: number;
          documents_complete: boolean;
          features: Database['public']['Enums']['special_requirement'][];
          kind: Database['public']['Enums']['vehicle_kind'];
          model_year: number;
          unit_type: Database['public']['Enums']['unit_type'];
          vehicle_id: string;
        }[];
      };
      load_route_data: { Args: { p_load_id: string }; Returns: Json };
      lock_company_approved: { Args: { p_company_id: string }; Returns: boolean };
      lock_offer_for_response: {
        Args: { p_by: string; p_offer_id: string };
        Returns: {
          amount_cents: number;
          carrier_company_id: string;
          conditions: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          load_id: string;
          negotiation_id: string;
          parent_offer_id: string | null;
          responded_at: string | null;
          responded_by: string | null;
          shipper_company_id: string;
          side: Database['public']['Enums']['offer_side'];
          status: Database['public']['Enums']['offer_status'];
          status_reason: string | null;
          vehicle_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'offers';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      lock_trip_as_operator: {
        Args: { p_trip_id: string };
        Returns: {
          assigned_at: string | null;
          business_unit_id: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          carrier_company_id: string;
          closed_at: string | null;
          created_at: string;
          delivered_at: string | null;
          estimated_unload_end_at: string | null;
          id: string;
          load_id: string;
          offer_id: string;
          operator_id: string | null;
          shipper_company_id: string;
          started_at: string | null;
          status: Database['public']['Enums']['trip_status'];
          updated_at: string;
          vehicle_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'trips';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      make_offer: {
        Args: {
          p_amount_cents: number;
          p_business_unit_id?: string;
          p_conditions?: string;
          p_load_id: string;
          p_vehicle_id?: string;
        };
        Returns: string;
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string; p_message_id?: string };
        Returns: undefined;
      };
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number };
      match_candidates: {
        Args: {
          p_availability_id?: string;
          p_limit?: number;
          p_max_empty_km?: number;
          p_vehicle_id?: string;
        };
        Returns: Database['public']['CompositeTypes']['match_candidate'][];
        SetofOptions: {
          from: '*';
          to: 'match_candidate';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      match_pairs: {
        Args: {
          p_availability_id?: string;
          p_load_id: string;
          p_max_empty_km: number;
          p_vehicle_id: string;
        };
        Returns: Database['public']['CompositeTypes']['match_candidate'][];
        SetofOptions: {
          from: '*';
          to: 'match_candidate';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      notify_business_unit_coordinators: {
        Args: {
          p_business_unit_id: string;
          p_data: Json;
          p_type: Database['public']['Enums']['notification_type'];
        };
        Returns: undefined;
      };
      notify_carrier_staff: {
        Args: {
          p_business_unit_id: string;
          p_company_id: string;
          p_data: Json;
          p_type: Database['public']['Enums']['notification_type'];
        };
        Returns: undefined;
      };
      notify_company: {
        Args: {
          p_company_id: string;
          p_data: Json;
          p_role: Database['public']['Enums']['user_role'];
          p_type: Database['public']['Enums']['notification_type'];
        };
        Returns: undefined;
      };
      open_internal_share: { Args: { p_token: string }; Returns: Json };
      operator_license_current: { Args: { p_operator_id: string }; Returns: boolean };
      process_document_expiry: { Args: { p_thresholds?: number[] }; Returns: number };
      product_event_properties_valid: {
        Args: { p_name: Database['public']['Enums']['product_event_name']; p_properties: Json };
        Returns: boolean;
      };
      public_shared_load: { Args: { p_token: string }; Returns: Json };
      public_shared_trip: { Args: { p_token: string }; Returns: Json };
      publish_load: { Args: { p_load_id: string }; Returns: undefined };
      put_route_distances: { Args: { p_legs: Json }; Returns: undefined };
      rate_limit_hit: {
        Args: {
          p_bucket: string;
          p_max_hits: number;
          p_now?: string;
          p_subject: string;
          p_window_seconds: number;
        };
        Returns: number;
      };
      rate_limit_policy: { Args: { p_bucket: string }; Returns: Record<string, unknown> };
      record_location_consent: {
        Args: { p_platform: string; p_policy_version: string };
        Returns: string;
      };
      record_notification_dispatch: { Args: { p_results: Json }; Returns: number };
      record_trip_event: {
        Args: {
          p_accuracy_m?: number;
          p_client_event_id?: string;
          p_estimated_unload_end_at?: string;
          p_event_type: Database['public']['Enums']['trip_event_type'];
          p_latitude?: number;
          p_longitude?: number;
          p_notes?: string;
          p_occurred_at: string;
          p_received_by_name?: string;
          p_trip_id: string;
        };
        Returns: string;
      };
      record_trip_locations: { Args: { p_points: Json; p_trip_id: string }; Returns: number };
      redeem_operator_invitation_service: {
        Args: {
          p_email?: string;
          p_full_name?: string;
          p_phone?: string;
          p_token: string;
          p_user_id: string;
        };
        Returns: {
          kind: Database['public']['Enums']['invitation_kind'];
          operator_id: string;
          profile_id: string;
        }[];
      };
      register_push_token: {
        Args: { p_platform: Database['public']['Enums']['push_platform']; p_token: string };
        Returns: undefined;
      };
      reject_offer: { Args: { p_offer_id: string; p_reason?: string }; Returns: undefined };
      remind_stale_trip_locations: { Args: { p_stale_after?: string }; Returns: number };
      report_incident: {
        Args: {
          p_client_event_id?: string;
          p_description: string;
          p_kind: Database['public']['Enums']['incident_kind'];
          p_latitude?: number;
          p_longitude?: number;
          p_occurred_at?: string;
          p_trip_id: string;
        };
        Returns: string;
      };
      request_company_review: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['verification_status'];
      };
      resolve_incident: {
        Args: { p_incident_id: string; p_resolution: string };
        Returns: undefined;
      };
      restore_vehicle_availability: {
        Args: { p_trip_id: string; p_vehicle_id: string };
        Returns: undefined;
      };
      review_company: {
        Args: { p_company_id: string; p_decision: string; p_notes?: string };
        Returns: Database['public']['Enums']['verification_status'];
      };
      review_document: {
        Args: {
          p_decision: string;
          p_document_id: string;
          p_expires_at?: string;
          p_notes?: string;
        };
        Returns: Database['public']['Enums']['verification_status'];
      };
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      revoke_location_consent: { Args: Record<PropertyKey, never>; Returns: number };
      revoke_operator_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      revoke_share_link: { Args: { p_id: string }; Returns: undefined };
      send_message: {
        Args: {
          p_attachments?: Json;
          p_body?: string;
          p_client_message_id?: string;
          p_conversation_id: string;
        };
        Returns: string;
      };
      set_estimated_unload_end: {
        Args: {
          p_client_event_id?: string;
          p_estimated_unload_end_at: string;
          p_occurred_at?: string;
          p_trip_id: string;
        };
        Returns: string;
      };
      set_trip_vehicle_availability: {
        Args: {
          p_from: string;
          p_trip: Omit<
            Database['public']['Tables']['trips']['Row'],
            Database['public']['Tables']['trips']['ComputedFields']
          >;
        };
        Returns: undefined;
      };
      set_vehicle_availability: {
        Args: {
          p_available_from: string;
          p_city: string;
          p_latitude: number;
          p_longitude: number;
          p_state: string;
          p_vehicle_id: string;
        };
        Returns: string;
      };
      share_link_by_token: {
        Args: { p_kind: Database['public']['Enums']['share_link_kind']; p_token: string };
        Returns: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          kind: Database['public']['Enums']['share_link_kind'];
          last_viewed_at: string | null;
          load_id: string | null;
          revoked_at: string | null;
          token_hash: string;
          trip_id: string | null;
          view_count: number;
        };
        SetofOptions: {
          from: '*';
          to: 'share_links';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      share_link_public_load: {
        Args: {
          p_load: Omit<
            Database['public']['Tables']['loads']['Row'],
            Database['public']['Tables']['loads']['ComputedFields']
          >;
        };
        Returns: Json;
      };
      share_link_record_view: { Args: { p_id: string }; Returns: undefined };
      shipper_trip_parties: {
        Args: { p_trip_ids: string[] };
        Returns: {
          carrier_legal_name: string;
          carrier_status: Database['public']['Enums']['verification_status'];
          operator_name: string;
          plate: string;
          trip_id: string;
          unit_type: Database['public']['Enums']['unit_type'];
        }[];
      };
      staff_role_for_company_type: {
        Args: { p_type: Database['public']['Enums']['company_type'] };
        Returns: Database['public']['Enums']['user_role'];
      };
      submit_document: {
        Args: {
          p_expires_at?: string;
          p_file_name?: string;
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
          p_requirement_id: string;
          p_storage_path: string;
        };
        Returns: string;
      };
      sync_load_negotiation_status: { Args: { p_load_id: string }; Returns: undefined };
      taxpayer_type_for_rfc: {
        Args: { p_rfc: string };
        Returns: Database['public']['Enums']['taxpayer_type'];
      };
      track_product_event: {
        Args: {
          p_load_id?: string;
          p_name: Database['public']['Enums']['product_event_name'];
          p_properties?: Json;
        };
        Returns: undefined;
      };
      trip_checklist: {
        Args: { p_trip_id: string };
        Returns: {
          code: string;
          done_at: string;
          required: boolean;
          responsible: string;
          stage: string;
        }[];
      };
      trip_event_transition: {
        Args: { p_event: Database['public']['Enums']['trip_event_type'] };
        Returns: Record<string, unknown>;
      };
      trip_evidence_missing: {
        Args: { p_stage: Database['public']['Enums']['evidence_stage']; p_trip_id: string };
        Returns: number;
      };
      trip_in_operator_hands: {
        Args: { p_status: Database['public']['Enums']['trip_status'] };
        Returns: boolean;
      };
      trip_is_active: {
        Args: { p_status: Database['public']['Enums']['trip_status'] };
        Returns: boolean;
      };
      trip_point_locations: {
        Args: { p_trip_id: string };
        Returns: {
          accuracy_m: number;
          latitude: number;
          longitude: number;
          occurred_at: string;
          record_id: string;
          source: string;
        }[];
      };
      unregister_push_token: { Args: { p_token: string }; Returns: undefined };
      update_load: { Args: { p_load: Json; p_load_id: string }; Returns: undefined };
      vehicle_committed_elsewhere: {
        Args: { p_trip_id: string; p_vehicle_id: string };
        Returns: boolean;
      };
      vehicle_committing_trip: {
        Args: { p_trip_id: string; p_vehicle_id: string };
        Returns: string;
      };
      vehicle_expired_requirements: {
        Args: { p_vehicle_id: string };
        Returns: {
          archived_at: string | null;
          code: string;
          company_type: Database['public']['Enums']['company_type'] | null;
          created_at: string;
          description: string | null;
          id: string;
          is_required: boolean;
          name: string;
          optional_for: Database['public']['Enums']['company_type'][];
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
          shareable_with_shipper: boolean;
          sort_order: number;
          taxpayer_type: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_requirements';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      vehicle_missing_requirements: {
        Args: { p_vehicle_id: string };
        Returns: {
          archived_at: string | null;
          code: string;
          company_type: Database['public']['Enums']['company_type'] | null;
          created_at: string;
          description: string | null;
          id: string;
          is_required: boolean;
          name: string;
          optional_for: Database['public']['Enums']['company_type'][];
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
          shareable_with_shipper: boolean;
          sort_order: number;
          taxpayer_type: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_requirements';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      vehicle_trip_chain_end: {
        Args: { p_vehicle_id: string };
        Returns: {
          available_from: string;
          load_id: string;
        }[];
      };
      withdraw_offer: { Args: { p_offer_id: string }; Returns: undefined };
    };
    Enums: {
      availability_source: 'manual' | 'trip_estimate';
      cargo_type:
        | 'general'
        | 'palletized'
        | 'perishable'
        | 'dry_bulk'
        | 'liquid_bulk'
        | 'hazardous'
        | 'oversized'
        | 'containerized'
        | 'vehicles'
        | 'construction_materials'
        | 'livestock';
      company_type: 'shipper' | 'carrier';
      conversation_kind: 'negotiation' | 'trip';
      document_owner_type: 'company' | 'vehicle' | 'operator';
      evidence_stage: 'pickup' | 'delivery' | 'incident';
      incident_kind:
        | 'delay'
        | 'mechanical_failure'
        | 'accident'
        | 'cargo_damage'
        | 'theft'
        | 'road_blockade'
        | 'other';
      incident_status: 'open' | 'resolved';
      invitation_kind: 'coordinator' | 'operator' | 'operator_access_reset';
      license_type: 'B' | 'C' | 'E';
      load_status:
        | 'draft'
        | 'published'
        | 'negotiating'
        | 'contracted'
        | 'in_progress'
        | 'completed'
        | 'cancelled'
        | 'expired';
      notification_type:
        | 'load_match'
        | 'offer_received'
        | 'counter_offer_received'
        | 'offer_accepted'
        | 'trip_assigned'
        | 'trip_status_changed'
        | 'document_approved'
        | 'document_rejected'
        | 'document_expiring'
        | 'trip_location_stale'
        | 'trip_unassigned';
      offer_side: 'shipper' | 'carrier';
      offer_status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'withdrawn' | 'expired';
      product_event_name: 'recommendations_viewed' | 'recommendation_opened' | 'offer_submitted';
      push_platform: 'ios' | 'android';
      share_link_kind: 'load_internal' | 'load_public' | 'trip_tracking_public';
      special_requirement:
        | 'temperature_control'
        | 'hazmat_permit'
        | 'liftgate'
        | 'tarp'
        | 'cargo_securing'
        | 'security_escort'
        | 'team_drivers'
        | 'extended_cargo_insurance'
        | 'loading_crew';
      taxpayer_type: 'moral' | 'fisica';
      trip_document_kind: 'service_order' | 'carta_porte' | 'invoice' | 'other';
      trip_document_stage: 'before_departure' | 'billing';
      trip_event_type:
        | 'created'
        | 'assigned'
        | 'departed'
        | 'arrived_at_pickup'
        | 'loading_started'
        | 'loading_finished'
        | 'arrived_at_delivery'
        | 'unloading_started'
        | 'unloading_finished'
        | 'delivery_confirmed'
        | 'cancelled'
        | 'unload_estimate_updated'
        | 'incident_reported'
        | 'incident_resolved';
      trip_status:
        | 'pending_assignment'
        | 'assigned'
        | 'en_route_to_pickup'
        | 'at_pickup'
        | 'loading'
        | 'in_transit'
        | 'at_delivery'
        | 'unloading'
        | 'delivered'
        | 'closed'
        | 'cancelled';
      unit_type:
        | 'dry_van'
        | 'refrigerated'
        | 'flatbed'
        | 'lowboy'
        | 'hopper'
        | 'tanker'
        | 'container_chassis'
        | 'cage'
        | 'stake_bed'
        | 'torton'
        | 'rabon'
        | 'pickup_3_5t';
      user_role: 'shipper' | 'manager' | 'coordinator' | 'operator' | 'admin';
      vehicle_kind: 'tractor' | 'rigid' | 'trailer';
      verification_status: 'pending_review' | 'approved' | 'rejected' | 'expired' | 'suspended';
    };
    CompositeTypes: {
      match_candidate: {
        load_id: string | null;
        company_id: string | null;
        vehicle_id: string | null;
        availability_id: string | null;
        start_city: string | null;
        start_state: string | null;
        start_lat: number | null;
        start_lng: number | null;
        available_from: string | null;
        is_return_trip: boolean | null;
        origin_city: string | null;
        origin_state: string | null;
        origin_lat: number | null;
        origin_lng: number | null;
        destination_city: string | null;
        destination_state: string | null;
        destination_lat: number | null;
        destination_lng: number | null;
        pickup_window_start: string | null;
        pickup_window_end: string | null;
        unit_type: Database['public']['Enums']['unit_type'] | null;
        weight_kg: number | null;
        proposed_price_cents: number | null;
        empty_km: number | null;
        home_distance_km: number | null;
        route_origin_city: string | null;
        route_destination_city: string | null;
      };
    };
  };
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      availability_source: ['manual', 'trip_estimate'],
      cargo_type: [
        'general',
        'palletized',
        'perishable',
        'dry_bulk',
        'liquid_bulk',
        'hazardous',
        'oversized',
        'containerized',
        'vehicles',
        'construction_materials',
        'livestock',
      ],
      company_type: ['shipper', 'carrier'],
      conversation_kind: ['negotiation', 'trip'],
      document_owner_type: ['company', 'vehicle', 'operator'],
      evidence_stage: ['pickup', 'delivery', 'incident'],
      incident_kind: [
        'delay',
        'mechanical_failure',
        'accident',
        'cargo_damage',
        'theft',
        'road_blockade',
        'other',
      ],
      incident_status: ['open', 'resolved'],
      invitation_kind: ['coordinator', 'operator', 'operator_access_reset'],
      license_type: ['B', 'C', 'E'],
      load_status: [
        'draft',
        'published',
        'negotiating',
        'contracted',
        'in_progress',
        'completed',
        'cancelled',
        'expired',
      ],
      notification_type: [
        'load_match',
        'offer_received',
        'counter_offer_received',
        'offer_accepted',
        'trip_assigned',
        'trip_status_changed',
        'document_approved',
        'document_rejected',
        'document_expiring',
        'trip_location_stale',
        'trip_unassigned',
      ],
      offer_side: ['shipper', 'carrier'],
      offer_status: ['pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'expired'],
      product_event_name: ['recommendations_viewed', 'recommendation_opened', 'offer_submitted'],
      push_platform: ['ios', 'android'],
      share_link_kind: ['load_internal', 'load_public', 'trip_tracking_public'],
      special_requirement: [
        'temperature_control',
        'hazmat_permit',
        'liftgate',
        'tarp',
        'cargo_securing',
        'security_escort',
        'team_drivers',
        'extended_cargo_insurance',
        'loading_crew',
      ],
      taxpayer_type: ['moral', 'fisica'],
      trip_document_kind: ['service_order', 'carta_porte', 'invoice', 'other'],
      trip_document_stage: ['before_departure', 'billing'],
      trip_event_type: [
        'created',
        'assigned',
        'departed',
        'arrived_at_pickup',
        'loading_started',
        'loading_finished',
        'arrived_at_delivery',
        'unloading_started',
        'unloading_finished',
        'delivery_confirmed',
        'cancelled',
        'unload_estimate_updated',
        'incident_reported',
        'incident_resolved',
      ],
      trip_status: [
        'pending_assignment',
        'assigned',
        'en_route_to_pickup',
        'at_pickup',
        'loading',
        'in_transit',
        'at_delivery',
        'unloading',
        'delivered',
        'closed',
        'cancelled',
      ],
      unit_type: [
        'dry_van',
        'refrigerated',
        'flatbed',
        'lowboy',
        'hopper',
        'tanker',
        'container_chassis',
        'cage',
        'stake_bed',
        'torton',
        'rabon',
        'pickup_3_5t',
      ],
      user_role: ['shipper', 'manager', 'coordinator', 'operator', 'admin'],
      vehicle_kind: ['tractor', 'rigid', 'trailer'],
      verification_status: ['pending_review', 'approved', 'rejected', 'expired', 'suspended'],
    },
  },
} as const;
