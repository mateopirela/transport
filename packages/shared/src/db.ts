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
          legal_name?: string;
          rfc?: string;
          status?: Database['public']['Enums']['verification_status'];
          status_reason?: string | null;
          type?: Database['public']['Enums']['company_type'];
          updated_at?: string;
        };
        Relationships: [];
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
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
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
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry?: boolean;
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
          owner_type?: Database['public']['Enums']['document_owner_type'];
          requires_expiry?: boolean;
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
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
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
        };
        ComputedFields: never;
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
            foreignKeyName: 'loads_shipper_company_id_fkey';
            columns: ['shipper_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      negotiations: {
        Row: {
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
          carrier_company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          load_id: string;
          shipper_company_id: string;
          updated_at?: string;
        };
        Update: {
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
            foreignKeyName: 'negotiations_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
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
        };
        ComputedFields: never;
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
            foreignKeyName: 'operators_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
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
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      trip_evidence: {
        Row: {
          captured_at: string;
          created_at: string;
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
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
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
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      trips: {
        Row: {
          assigned_at: string | null;
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
            foreignKeyName: 'trips_carrier_company_id_fkey';
            columns: ['carrier_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
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
          id: string;
          location: unknown;
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
          id?: string;
          location: unknown;
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
          id?: string;
          location?: unknown;
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
            foreignKeyName: 'vehicles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
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
    Views: Record<never, never>;
    Functions: {
      accept_offer: { Args: { p_offer_id: string }; Returns: string };
      accept_operator_invitation: { Args: { p_code: string }; Returns: string };
      add_trip_evidence: {
        Args: {
          p_captured_at: string;
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
      assert_coordinates: { Args: { p_lat: number; p_lng: number }; Returns: undefined };
      assert_pickup_open: { Args: { p_load_id: string }; Returns: undefined };
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
      assign_trip: {
        Args: { p_operator_id: string; p_trip_id: string; p_vehicle_id: string };
        Returns: undefined;
      };
      auth_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_fleet_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_operator_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
      auth_shipper_company_id: { Args: Record<PropertyKey, never>; Returns: string };
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
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
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
      confirm_delivery: { Args: { p_notes?: string; p_trip_id: string }; Returns: undefined };
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
      create_load: { Args: { p_load: Json }; Returns: string };
      create_operator_invitation: {
        Args: { p_operator_id: string; p_valid_for_hours?: number };
        Returns: {
          code: string;
          expires_at: string;
          invitation_id: string;
        }[];
      };
      create_trip_for_accepted_offer: { Args: { p_offer_id: string }; Returns: string };
      document_owner_company_id: {
        Args: {
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
        };
        Returns: string;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_company_approved: { Args: Record<PropertyKey, never>; Returns: boolean };
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
          p_conditions?: string;
          p_load_id: string;
          p_vehicle_id?: string;
        };
        Returns: string;
      };
      publish_load: { Args: { p_load_id: string }; Returns: undefined };
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
          p_trip_id: string;
        };
        Returns: string;
      };
      record_trip_locations: { Args: { p_points: Json; p_trip_id: string }; Returns: number };
      reject_offer: { Args: { p_offer_id: string; p_reason?: string }; Returns: undefined };
      report_incident: {
        Args: {
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
      revoke_operator_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
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
      trip_event_transition: {
        Args: { p_event: Database['public']['Enums']['trip_event_type'] };
        Returns: Record<string, unknown>;
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
      update_load: { Args: { p_load: Json; p_load_id: string }; Returns: undefined };
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
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
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
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
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
      offer_side: 'shipper' | 'carrier';
      offer_status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'withdrawn' | 'expired';
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
      user_role: 'shipper' | 'carrier' | 'operator' | 'admin';
      vehicle_kind: 'tractor' | 'rigid' | 'trailer';
      verification_status: 'pending_review' | 'approved' | 'rejected' | 'expired' | 'suspended';
    };
    CompositeTypes: Record<never, never>;
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
      offer_side: ['shipper', 'carrier'],
      offer_status: ['pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'expired'],
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
      user_role: ['shipper', 'carrier', 'operator', 'admin'],
      vehicle_kind: ['tractor', 'rigid', 'trailer'],
      verification_status: ['pending_review', 'approved', 'rejected', 'expired', 'suspended'],
    },
  },
} as const;
