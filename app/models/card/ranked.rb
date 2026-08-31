module Card::Ranked
  extend ActiveSupport::Concern

  included do
    scope :ranked, -> { order(:position, :id) }

    before_create :assign_list_position
  end

  def move_before(other)
    transaction do
      if parent_card_id.present?
        move_child_before(other)
      else
        move_top_level_before(other)
      end
    end
  end

  def place_at_front_of_list
    return unless has_attribute?(:position)

    list_peers.where.not(id: id).update_all("position = position + 1")
    update_column(:position, 0)
  end

  private
    def assign_list_position
      return unless has_attribute?(:position)
      return if will_save_change_to_position? && !position.to_i.zero?

      self.position = next_peer_position
    end

    def next_peer_position
      (list_peers.where.not(id: id).maximum(:position) || -1) + 1
    end

    def list_peers
      if parent_card_id.present?
        self.class.where(parent_card_id: parent_card_id)
      elsif column_id.present?
        board.cards.where(column_id: column_id, parent_card_id: nil)
      else
        board.cards.where(column_id: nil, parent_card_id: nil)
      end
    end

    def move_top_level_before(other)
      write_positions ordered_peers_inserting_before(list_peers.ranked.to_a, other)
    end

    def move_child_before(other)
      if (step = origin_step)
        step.move_before(other&.origin_step)
      else
        write_positions ordered_peers_inserting_before(list_peers.ranked.to_a, other)
      end
    end

    def ordered_peers_inserting_before(peers, other)
      peers.delete(self)
      index = other ? (peers.index(other) || peers.length) : peers.length
      peers.insert(index, self)
      peers
    end

    def write_positions(records)
      records.each_with_index do |record, index|
        record.update_column(:position, index) if record.position != index
      end
    end
end
