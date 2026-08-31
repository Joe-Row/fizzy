class AddChildCardIdToSteps < ActiveRecord::Migration[8.2]
  def change
    add_column :steps, :child_card_id, :uuid, if_not_exists: true
    add_index :steps, :child_card_id, unique: true, if_not_exists: true

    reversible do |dir|
      dir.up { backfill_steps_for_child_cards }
    end
  end

  private
    def backfill_steps_for_child_cards
      now = Time.current
      Card.where.not(parent_card_id: nil).find_each do |child|
        next if child.title == "sp"
        next if Step.exists?(child_card_id: child.id)

        parent = Card.find_by(id: child.parent_card_id)
        next unless parent

        content = child.title.presence || "Untitled"
        closed = Closure.exists?(card_id: child.id)
        existing = parent.steps.find_by(content: content, child_card_id: nil)

        if existing
          existing.update_columns(child_card_id: child.id, completed: closed || existing.completed, updated_at: now)
        else
          Step.create!(
            account: parent.account,
            card: parent,
            child_card: child,
            content: content,
            completed: closed,
            created_at: child.created_at || now,
            updated_at: now
          )
        end
      end
    end
end
