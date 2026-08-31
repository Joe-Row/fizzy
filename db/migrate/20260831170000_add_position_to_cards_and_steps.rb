class AddPositionToCardsAndSteps < ActiveRecord::Migration[8.2]
  def change
    add_column :cards, :position, :integer, default: 0, null: false, if_not_exists: true
    add_index :cards, [ :column_id, :position ], if_not_exists: true
    add_column :steps, :position, :integer, default: 0, null: false, if_not_exists: true
    add_index :steps, [ :card_id, :position ], if_not_exists: true

    reversible do |dir|
      dir.up { backfill_positions }
    end
  end

  private
    def backfill_positions
      Column.find_each do |column|
        rank_cards column.cards.where(parent_card_id: nil).order(last_active_at: :desc, id: :desc)
      end

      Board.find_each do |board|
        rank_cards board.cards.where(column_id: nil, parent_card_id: nil).order(last_active_at: :desc, id: :desc)
      end

      Card.where.not(parent_card_id: nil).select(:parent_card_id).distinct.pluck(:parent_card_id).each do |parent_id|
        rank_cards Card.where(parent_card_id: parent_id).order(:number, :id)
      end

      Card.find_each do |card|
        card.steps.order(:id).each_with_index do |step, index|
          step.update_column(:position, index)
          if step.child_card_id.present? && (child = step.child_card)
            child.update_column(:position, index) if child.position != index
          end
        end
      end
    end

    def rank_cards(scope)
      scope.each_with_index do |card, index|
        card.update_column(:position, index) if card.position != index
      end
    end
end
