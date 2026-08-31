class AddParentCardIdToCards < ActiveRecord::Migration[8.2]
  def change
    add_column :cards, :parent_card_id, :uuid
    add_index :cards, :parent_card_id
  end
end
