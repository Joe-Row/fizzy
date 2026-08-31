module Card::Triageable
  extend ActiveSupport::Concern

  included do
    belongs_to :column, optional: true, touch: true

    scope :awaiting_triage, -> { active.where.missing(:column) }
    scope :triaged, -> { active.joins(:column) }
  end

  def triaged?
    active? && column.present?
  end

  def awaiting_triage?
    active? && !triaged?
  end

  def triage_into(column)
    raise "The column must belong to the card board" unless board == column.board

    transaction do
      resume
      update! column: column
      place_at_front_of_list
      track_event "triaged", particulars: { column: column.name }
      sync_child_cards_column!(column)
    end
  end

  def send_back_to_triage(skip_event: false)
    transaction do
      resume
      update! column: nil
      place_at_front_of_list
      track_event "sent_back_to_triage" unless skip_event
      sync_child_cards_column!(nil)
    end
  end

  private
    def sync_child_cards_column!(column)
      return unless has_attribute?(:parent_card_id)

      now = Time.current
      self.class.where(parent_card_id: id).find_each do |child|
        next if child.column_id == column&.id
        child.update_columns(column_id: column&.id, updated_at: now)
      end
    end
end
