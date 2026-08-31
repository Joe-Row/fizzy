class AddParentCardIdToCards < ActiveRecord::Migration[8.2]
  def change
    add_column :cards, :parent_card_id, :uuid, if_not_exists: true
    add_index :cards, :parent_card_id, if_not_exists: true
  end
end
